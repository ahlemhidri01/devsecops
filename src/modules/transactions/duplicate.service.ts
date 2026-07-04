// ==============================================================
// SecureBank — Duplicate Detection Service
// Prevents accidental duplicate transfers (same amount, beneficiary, <60s)
// ==============================================================

import { prisma } from '../../shared/database';
import { AppError } from '../../shared/middleware';
import { TransactionType } from '@prisma/client';

export class DuplicateService {
  /**
   * Checks if a similar transaction was executed recently.
   * Criteria: Same sender, same amount, same receiver/IBAN, within the last 60 seconds.
   */
  static async checkDuplicate(
    senderAccountId: string,
    amount: number,
    type: TransactionType,
    receiverAccountId?: string,
    externalIban?: string
  ): Promise<void> {
    const sixtySecondsAgo = new Date(Date.now() - 60000);

    const duplicate = await prisma.transaction.findFirst({
      where: {
        senderAccountId,
        amount,
        type,
        receiverAccountId: receiverAccountId || null,
        externalIban: externalIban || null,
        createdAt: {
          gte: sixtySecondsAgo,
        },
        status: {
          in: ['PENDING', 'PROCESSING', 'COMPLETED'], // Ignore failed/cancelled
        },
      },
    });

    if (duplicate) {
      throw new AppError(
        'A very similar transaction was processed within the last 60 seconds. Please wait or check your transaction history.',
        409,
        'DUPLICATE_TRANSACTION'
      );
    }
  }

  /**
   * Validates the idempotency key to prevent retry-based duplicates.
   */
  static async checkIdempotency(idempotencyKey: string): Promise<void> {
    const existing = await prisma.transaction.findUnique({
      where: { idempotencyKey },
    });

    if (existing) {
      // If it exists, we throw a conflict.
      // In a more complex system, we might return the existing transaction response instead.
      throw new AppError(
        'Idempotency key has already been used',
        409,
        'IDEMPOTENCY_KEY_USED'
      );
    }
  }
}
