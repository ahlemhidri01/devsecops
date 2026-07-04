// ==============================================================
// SecureBank — Beneficiaries Module Validators
// ==============================================================

import { z } from 'zod';
import { ibanSchema, bicSchema, nameSchema, totpCodeSchema } from '../../shared/validation';

export const addBeneficiarySchema = z.object({
  body: z.object({
    name: nameSchema,
    iban: ibanSchema,
    bic: bicSchema.optional(), // Optional for SEPA, required for SWIFT
    bankName: z.string().max(100).optional(),
    totpCode: totpCodeSchema, // MFA is strictly required to add a beneficiary
  }),
});

export const updateBeneficiarySchema = z.object({
  body: z.object({
    name: nameSchema.optional(),
    isActive: z.boolean().optional(),
    // Cannot update IBAN - must delete and add new (which triggers quarantine)
  }),
});
