// ==============================================================
// SecureBank — Transactions Module Validators
// ==============================================================

import { z } from 'zod';
import { TransactionType, TransferScheduleFrequency } from '@prisma/client';
import { uuidSchema, amountSchema, ibanSchema, bicSchema, descriptionSchema, paginationSchema, dateRangeSchema } from '../../shared/validation';

export const initiateTransferSchema = z.object({
  body: z.object({
    idempotencyKey: uuidSchema,
    senderAccountId: uuidSchema.optional(), // Can be inferred from context or default account
    receiverAccountId: uuidSchema.optional(), // For internal transfers
    externalIban: ibanSchema.optional(), // For SEPA/SWIFT
    externalBic: bicSchema.optional(),
    type: z.nativeEnum(TransactionType),
    amount: amountSchema,
    currency: z.string().length(3).default('EUR'),
    description: descriptionSchema,
    totpCode: z.string().length(6).optional(), // Required if amount > MFA threshold
  }).refine((data) => {
    // Cross-field validation: Either internal receiver or external IBAN must be present
    if (data.type === TransactionType.INTERNAL_TRANSFER) {
      return !!data.receiverAccountId;
    } else {
      return !!data.externalIban;
    }
  }, { message: 'Must provide either receiverAccountId for internal transfers or externalIban for SEPA/SWIFT' }),
});

export const scheduleTransferSchema = initiateTransferSchema.and(
  z.object({
    body: z.object({
      frequency: z.nativeEnum(TransferScheduleFrequency),
      firstExecutionDate: z.string().datetime(),
    }),
  })
);

export const getTransactionsSchema = z.object({
  query: paginationSchema.and(dateRangeSchema).and(
    z.object({
      type: z.nativeEnum(TransactionType).optional(),
      status: z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED', 'BLOCKED_FRAUD']).optional(),
      accountId: uuidSchema.optional(),
    })
  ),
});
