// ==============================================================
// SecureBank — Cards Module Validators
// ==============================================================

import { z } from 'zod';
import { CardType } from '@prisma/client';
import { uuidSchema, amountSchema, pinSchema } from '../../shared/validation';

export const createCardSchema = z.object({
  body: z.object({
    accountId: uuidSchema,
    type: z.nativeEnum(CardType),
    isSingleUse: z.boolean().optional(), // For virtual cards
  }),
});

export const updateCardSettingsSchema = z.object({
  body: z.object({
    dailyLimit: amountSchema.optional(),
    monthlyLimit: amountSchema.optional(),
    contactlessEnabled: z.boolean().optional(),
    onlinePaymentEnabled: z.boolean().optional(),
    internationalEnabled: z.boolean().optional(),
  }),
});

export const setPinSchema = z.object({
  body: z.object({
    pin: pinSchema,
  }),
});
