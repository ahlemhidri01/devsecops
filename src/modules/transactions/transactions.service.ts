// ==============================================================
// SecureBank — Transactions Service
// Entry point for transaction initiation and retrieval
// ==============================================================

import { TransactionType } from '@prisma/client';
import { prisma } from '../../shared/database';
import { AppError } from '../../shared/middleware';
import { config } from '../../shared/config';
import { DuplicateService } from './duplicate.service';
import { FraudService } from './fraud.service';
import { TransferService } from './transfer.service';
import { MfaService } from '../auth/mfa.service';
import { publishEvent, KAFKA_TOPICS } from '../../shared/kafka';
import { logAuditEvent } from '../../shared/middleware';

export class TransactionsService {
  /**
   * Initiates a new transaction.
   */
  static async initiateTransaction(
    userId: string,
    data: {
      idempotencyKey: string;
      senderAccountId?: string;
      receiverAccountId?: string;
      externalIban?: string;
      externalBic?: string;
      type: TransactionType;
      amount: number;
      currency: string;
      description?: string;
      totpCode?: string;
    },
    ipAddress?: string,
    device?: string
  ) {
    // 1. Idempotency Check
    await DuplicateService.checkIdempotency(data.idempotencyKey);

    // 2. Resolve Sender Account
    let senderId = data.senderAccountId;
    if (!senderId) {
      // Default to first active COURANT account
      const defaultAcc = await prisma.account.findFirst({
        where: { userId, type: 'COURANT', status: 'ACTIVE' },
      });
      if (!defaultAcc) throw new AppError('No active account found to send from', 400);
      senderId = defaultAcc.id;
    } else {
      // Verify ownership
      const senderAcc = await prisma.account.findUnique({ where: { id: senderId } });
      if (!senderAcc || senderAcc.userId !== userId) {
        throw new AppError('Invalid sender account', 403);
      }
    }

    // 3. MFA Verification for high amounts
    let mfaVerified = false;
    if (data.amount >= config.TRANSFER_MFA_THRESHOLD) {
      if (!data.totpCode) {
        throw new AppError(`Transfers over ${config.TRANSFER_MFA_THRESHOLD}€ require MFA verification`, 403, 'MFA_REQUIRED');
      }
      const isValidMfa = await MfaService.verifyCode(userId, data.totpCode);
      if (!isValidMfa) {
        throw new AppError('Invalid MFA code', 401);
      }
      mfaVerified = true;
    }

    // 4. Duplicate Check (< 60s)
    await DuplicateService.checkDuplicate(senderId, data.amount, data.type, data.receiverAccountId, data.externalIban);

    // 5. Fraud Scoring
    const isInternational = data.type === 'SWIFT_TRANSFER';
    const fraudScore = await FraudService.calculateScore(userId, data.amount, ipAddress, device, isInternational);
    
    const isFraudulent = FraudService.isFraudulent(fraudScore);

    // 6. Generate Digital Signature (Non-repudiation)
    const signature = TransferService.generateSignature(data);

    // 7. Create Transaction Record (PENDING or BLOCKED)
    const transaction = await prisma.transaction.create({
      data: {
        idempotencyKey: data.idempotencyKey,
        senderAccountId: senderId,
        receiverAccountId: data.receiverAccountId,
        externalIban: data.externalIban ? data.externalIban : null, // Would be encrypted in real app if stored
        externalBic: data.externalBic,
        type: data.type,
        status: isFraudulent ? 'BLOCKED_FRAUD' : 'PENDING',
        amount: data.amount,
        currency: data.currency,
        description: data.description,
        signature,
        fraudScore,
        mfaVerified,
      },
    });

    await logAuditEvent('TRANSACTION_INITIATED', 'Transaction', transaction.id, userId, { type: data.type, amount: data.amount }, ipAddress || null, device || null);
    await publishEvent(KAFKA_TOPICS.TRANSACTION_EVENTS, 'TRANSACTION_INITIATED', { transactionId: transaction.id });

    if (isFraudulent) {
      await logAuditEvent('TRANSACTION_BLOCKED_FRAUD', 'Transaction', transaction.id, userId, { fraudScore }, ipAddress || null, device || null);
      await publishEvent(KAFKA_TOPICS.FRAUD_ALERTS, 'FRAUD_DETECTED', { transactionId: transaction.id, fraudScore, userId });
      throw new AppError('Transaction blocked by security policy', 403, 'FRAUD_DETECTED');
    }

    // 8. Process Transfer (Async or Sync depending on type)
    // For a real app, this might be pushed to a queue. We await it here for simplicity.
    await TransferService.processTransfer(transaction.id, data.type);

    // 9. Return updated transaction
    const finalTx = await prisma.transaction.findUnique({ where: { id: transaction.id } });
    return finalTx;
  }

  /**
   * Retrieves transaction history with pagination and filters.
   */
  static async getTransactions(
    userId: string,
    filters: {
      accountId?: string;
      type?: TransactionType;
      status?: any;
      startDate?: Date;
      endDate?: Date;
      page: number;
      limit: number;
    }
  ) {
    // Determine which accounts belong to the user
    let accountIds: string[] = [];
    
    if (filters.accountId) {
      const acc = await prisma.account.findUnique({ where: { id: filters.accountId } });
      if (!acc || acc.userId !== userId) throw new AppError('Access denied', 403);
      accountIds = [filters.accountId];
    } else {
      const accounts = await prisma.account.findMany({ where: { userId }, select: { id: true } });
      accountIds = accounts.map(a => a.id);
    }

    const whereClause: any = {
      OR: [
        { senderAccountId: { in: accountIds } },
        { receiverAccountId: { in: accountIds } }
      ]
    };

    if (filters.type) whereClause.type = filters.type;
    if (filters.status) whereClause.status = filters.status;
    if (filters.startDate || filters.endDate) {
      whereClause.createdAt = {};
      if (filters.startDate) whereClause.createdAt.gte = filters.startDate;
      if (filters.endDate) whereClause.createdAt.lte = filters.endDate;
    }

    const skip = (filters.page - 1) * filters.limit;

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        skip,
        take: filters.limit,
      }),
      prisma.transaction.count({ where: whereClause })
    ]);

    return {
      transactions: transactions.map(t => ({
        ...t,
        amount: Number(t.amount),
        fraudScore: t.fraudScore ? Number(t.fraudScore) : null,
      })),
      meta: {
        total,
        page: filters.page,
        limit: filters.limit,
        totalPages: Math.ceil(total / filters.limit)
      }
    };
  }
}
