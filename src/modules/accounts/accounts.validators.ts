// ==============================================================
// SecureBank — Accounts Module Validators
// ==============================================================

import { z } from 'zod';
import { AccountType } from '@prisma/client';
import { uuidSchema, amountSchema } from '../../shared/validation';

export const createAccountSchema = z.object({
  body: z.object({
    type: z.nativeEnum(AccountType),
    label: z.string().max(50).optional(),
    currency: z.string().length(3).default('EUR'),
    // Admins can create accounts for other users
    userId: uuidSchema.optional(),
  }),
});

export const updateAccountLimitsSchema = z.object({
  body: z.object({
    dailyLimit: amountSchema.optional(),
    monthlyLimit: amountSchema.optional(),
  }),
});

export const getAccountStatementsSchema = z.object({
  query: z.object({
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
  }),
});
