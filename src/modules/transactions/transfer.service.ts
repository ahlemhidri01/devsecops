// ==============================================================
// SecureBank — Transfer Service
// Business logic for different types of transfers
// ==============================================================

import { TransactionType } from '@prisma/client';
import { prisma } from '../../shared/database';
import { AppError } from '../../shared/middleware';
import { SagaService } from './saga.service';
import { publishEvent, KAFKA_TOPICS } from '../../shared/kafka';
import { signTransaction } from '../../shared/security';
import { encrypt } from '../../shared/security';

export class TransferService {
  /**
   * Orchestrates the transfer process.
   */
  static async processTransfer(transactionId: string, type: TransactionType) {
    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
    });

    if (!transaction) throw new AppError('Transaction not found', 404);
    if (transaction.status !== 'PENDING') return; // Already processed

    try {
      let updatedTx;

      switch (type) {
        case TransactionType.INTERNAL_TRANSFER:
          if (!transaction.senderAccountId || !transaction.receiverAccountId) {
            throw new AppError('Internal transfer requires both sender and receiver accounts', 400);
          }
          updatedTx = await SagaService.executeInternalTransfer(
            transactionId,
            transaction.senderAccountId,
            transaction.receiverAccountId,
            Number(transaction.amount)
          );
          break;

        case TransactionType.SEPA_TRANSFER:
        case TransactionType.SEPA_INSTANT:
        case TransactionType.SWIFT_TRANSFER:
          if (!transaction.senderAccountId || !transaction.externalIban) {
            throw new AppError('External transfer requires sender account and external IBAN', 400);
          }
          
          // Check beneficiary quarantine
          await this.checkBeneficiaryQuarantine(transaction.senderAccountId, transaction.externalIban);

          updatedTx = await SagaService.executeExternalTransfer(
            transactionId,
            transaction.senderAccountId,
            Number(transaction.amount)
          );

          // In a real system, we would publish a message to a clearing house gateway here.
          // For SEPA Instant, we would wait for sync response.
          // For standard SEPA/SWIFT, it remains PROCESSING until an async webhook updates it.
          
          // Mock async completion for SEPA Instant
          if (type === TransactionType.SEPA_INSTANT) {
             updatedTx = await prisma.transaction.update({
               where: { id: transactionId },
               data: { status: 'COMPLETED', completedAt: new Date() }
             });
          }
          break;

        default:
          throw new AppError('Unsupported transaction type', 400);
      }

      // Publish success event
      if (updatedTx.status === 'COMPLETED') {
        await publishEvent(KAFKA_TOPICS.TRANSACTION_EVENTS, 'TRANSACTION_COMPLETED', {
          transactionId: updatedTx.id,
          status: updatedTx.status,
          amount: Number(updatedTx.amount),
        });
      }

    } catch (error) {
      // Failure is handled in SagaService (DB update)
      await publishEvent(KAFKA_TOPICS.TRANSACTION_EVENTS, 'TRANSACTION_FAILED', {
        transactionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Ensures the external IBAN is an active beneficiary and not in quarantine.
   */
  private static async checkBeneficiaryQuarantine(senderAccountId: string, externalIban: string) {
    const account = await prisma.account.findUnique({
      where: { id: senderAccountId },
      select: { userId: true },
    });

    if (!account) throw new AppError('Sender account not found', 404);

    const encryptedIban = encrypt(externalIban);

    const beneficiary = await prisma.beneficiary.findFirst({
      where: {
        userId: account.userId,
        iban: encryptedIban,
        isActive: true,
      },
    });

    if (!beneficiary) {
      throw new AppError('External IBAN is not a registered beneficiary', 403);
    }

    if (beneficiary.quarantineUntil && beneficiary.quarantineUntil > new Date()) {
      const hoursRemaining = Math.ceil((beneficiary.quarantineUntil.getTime() - Date.now()) / (1000 * 60 * 60));
      throw new AppError(`Beneficiary is in quarantine. ${hoursRemaining} hours remaining.`, 403, 'BENEFICIARY_QUARANTINE');
    }
  }

  /**
   * Digitally signs the transaction data for non-repudiation.
   */
  static generateSignature(txData: any): string {
    const dataToSign = `${txData.senderAccountId}|${txData.receiverAccountId || txData.externalIban}|${txData.amount}|${txData.currency}|${txData.idempotencyKey}`;
    return signTransaction(dataToSign);
  }
}
