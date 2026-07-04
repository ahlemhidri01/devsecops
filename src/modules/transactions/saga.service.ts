// ==============================================================
// SecureBank — Saga Pattern Service (Atomicity)
// Ensures distributed transaction consistency with automatic rollback
// ==============================================================

import { PrismaClient, Transaction as DbTransaction } from '@prisma/client';
import { prisma } from '../../shared/database';
import { AppError } from '../../shared/middleware';
import { createModuleLogger } from '../../shared/logging';

const logger = createModuleLogger('saga-service');

type PrismaTransactionClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

/**
 * Handles complex multi-step financial operations with guaranteed atomicity.
 * If any step fails, the entire transaction is rolled back via Prisma's interactive transactions.
 * Note: For cross-microservice sagas, this would be an orchestrator using Kafka.
 * Here, we use DB transactions since accounts and transactions share the DB.
 */
export class SagaService {
  /**
   * Executes an internal transfer between two accounts securely.
   */
  static async executeInternalTransfer(
    transactionId: string,
    senderAccountId: string,
    receiverAccountId: string,
    amount: number
  ): Promise<DbTransaction> {
    try {
      return await prisma.$transaction(async (tx) => {
        // 1. Lock accounts for update to prevent race conditions (Concurrency control)
        const sender = await tx.$queryRaw<any[]>`
          SELECT balance, "dailyLimit", "monthlyLimit" 
          FROM accounts 
          WHERE id = ${senderAccountId} FOR UPDATE
        `;

        if (!sender.length) throw new AppError('Sender account not found', 404);

        const receiver = await tx.$queryRaw<any[]>`
          SELECT id 
          FROM accounts 
          WHERE id = ${receiverAccountId} FOR UPDATE
        `;

        if (!receiver.length) throw new AppError('Receiver account not found', 404);

        const currentBalance = Number(sender[0].balance);

        // 2. Check sufficient funds
        if (currentBalance < amount) {
          throw new AppError('Insufficient funds', 400, 'INSUFFICIENT_FUNDS');
        }

        // 3. Check limits (simplified - would normally aggregate today's transfers)
        if (amount > Number(sender[0].dailyLimit)) {
          throw new AppError('Transfer exceeds daily limit', 403, 'LIMIT_EXCEEDED');
        }

        // 4. Deduct from sender
        await tx.$executeRaw`
          UPDATE accounts 
          SET balance = balance - ${amount}, "updatedAt" = NOW() 
          WHERE id = ${senderAccountId}
        `;

        // 5. Add to receiver
        await tx.$executeRaw`
          UPDATE accounts 
          SET balance = balance + ${amount}, "updatedAt" = NOW() 
          WHERE id = ${receiverAccountId}
        `;

        // 6. Update transaction status
        const completedTx = await tx.transaction.update({
          where: { id: transactionId },
          data: {
            status: 'COMPLETED',
            completedAt: new Date(),
          },
        });

        return completedTx;
      }, {
        maxWait: 5000,
        timeout: 10000,
        isolationLevel: 'ReadCommitted', // Prevent dirty reads
      });
    } catch (error) {
      logger.error('Saga execution failed, rolling back', { transactionId, error: error instanceof Error ? error.message : 'Unknown error' });
      
      // Update transaction status to failed outside the rolled-back tx
      await prisma.transaction.update({
        where: { id: transactionId },
        data: {
          status: 'FAILED',
          failureReason: error instanceof Error ? error.message : 'Transaction rolled back',
        },
      });

      throw error;
    }
  }

  /**
   * Executes an external transfer (SEPA/SWIFT).
   * Deducts funds immediately, but completion depends on external bank network (async).
   */
  static async executeExternalTransfer(
    transactionId: string,
    senderAccountId: string,
    amount: number
  ): Promise<DbTransaction> {
    try {
      return await prisma.$transaction(async (tx) => {
        // 1. Lock sender account
        const sender = await tx.$queryRaw<any[]>`
          SELECT balance FROM accounts WHERE id = ${senderAccountId} FOR UPDATE
        `;

        if (!sender.length) throw new AppError('Sender account not found', 404);

        const currentBalance = Number(sender[0].balance);

        // 2. Check sufficient funds
        if (currentBalance < amount) {
          throw new AppError('Insufficient funds', 400, 'INSUFFICIENT_FUNDS');
        }

        // 3. Deduct from sender (Funds held/debited)
        await tx.$executeRaw`
          UPDATE accounts 
          SET balance = balance - ${amount}, "updatedAt" = NOW() 
          WHERE id = ${senderAccountId}
        `;

        // 4. Update transaction status to PROCESSING (waiting for external clearing)
        const processingTx = await tx.transaction.update({
          where: { id: transactionId },
          data: {
            status: 'PROCESSING',
          },
        });

        return processingTx;
      });
    } catch (error) {
      logger.error('External transfer deduction failed', { transactionId });
      
      await prisma.transaction.update({
        where: { id: transactionId },
        data: {
          status: 'FAILED',
          failureReason: error instanceof Error ? error.message : 'Failed to deduct funds',
        },
      });

      throw error;
    }
  }
}
