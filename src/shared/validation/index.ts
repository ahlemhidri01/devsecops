// ==============================================================
// SecureBank — Zod Validation Schemas
// Common validators for banking data types
// ==============================================================

import { z } from 'zod';

// ──────────────────────────────────────
// COMMON VALIDATORS
// ──────────────────────────────────────

/**
 * UUID v4 format validator.
 */
export const uuidSchema = z.string().uuid('Invalid UUID format');

/**
 * Email validator with max length.
 */
export const emailSchema = z
  .string()
  .email('Invalid email format')
  .max(255, 'Email must not exceed 255 characters')
  .toLowerCase()
  .trim();

/**
 * Password validator — minimum 12 characters, must contain:
 * uppercase, lowercase, digit, special character.
 */
export const passwordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .max(128, 'Password must not exceed 128 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one digit')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

/**
 * Phone number validator (international format).
 */
export const phoneSchema = z
  .string()
  .regex(/^\+[1-9]\d{6,14}$/, 'Invalid phone number format (use international format: +33...)')
  .optional();

/**
 * Name validator — letters, spaces, hyphens, accented characters.
 */
export const nameSchema = z
  .string()
  .min(2, 'Name must be at least 2 characters')
  .max(100, 'Name must not exceed 100 characters')
  .regex(/^[a-zA-ZÀ-ÿ\s'-]+$/, 'Name contains invalid characters');

// ──────────────────────────────────────
// BANKING VALIDATORS
// ──────────────────────────────────────

/**
 * IBAN validator — basic format check (detailed validation in security utils).
 */
export const ibanSchema = z
  .string()
  .min(15, 'IBAN must be at least 15 characters')
  .max(34, 'IBAN must not exceed 34 characters')
  .regex(/^[A-Z]{2}\d{2}[A-Z0-9]+$/, 'Invalid IBAN format')
  .transform((val) => val.replace(/\s/g, '').toUpperCase());

/**
 * BIC/SWIFT code validator.
 */
export const bicSchema = z
  .string()
  .regex(/^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/, 'Invalid BIC/SWIFT format')
  .optional();

/**
 * Monetary amount validator — positive, max 2 decimal places.
 */
export const amountSchema = z
  .number()
  .positive('Amount must be positive')
  .max(999999999.99, 'Amount exceeds maximum allowed')
  .multipleOf(0.01, 'Amount can have at most 2 decimal places');

/**
 * Currency code validator (ISO 4217).
 */
export const currencySchema = z
  .string()
  .length(3, 'Currency code must be exactly 3 characters')
  .regex(/^[A-Z]{3}$/, 'Invalid currency code')
  .default('EUR');

/**
 * Transaction description validator.
 */
export const descriptionSchema = z
  .string()
  .max(500, 'Description must not exceed 500 characters')
  .regex(/^[a-zA-Z0-9À-ÿ\s.,;:!?'"-/()]+$/, 'Description contains invalid characters')
  .optional();

// ──────────────────────────────────────
// PAGINATION VALIDATORS
// ──────────────────────────────────────

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// ──────────────────────────────────────
// DATE VALIDATORS
// ──────────────────────────────────────

export const dateRangeSchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
}).refine(
  (data) => {
    if (data.startDate && data.endDate) {
      return data.startDate <= data.endDate;
    }
    return true;
  },
  { message: 'Start date must be before or equal to end date' }
);

// ──────────────────────────────────────
// MFA VALIDATORS
// ──────────────────────────────────────

/**
 * TOTP code validator — exactly 6 digits.
 */
export const totpCodeSchema = z
  .string()
  .length(6, 'TOTP code must be exactly 6 digits')
  .regex(/^\d{6}$/, 'TOTP code must contain only digits');

/**
 * PIN validator — exactly 4-6 digits.
 */
export const pinSchema = z
  .string()
  .min(4, 'PIN must be at least 4 digits')
  .max(6, 'PIN must not exceed 6 digits')
  .regex(/^\d+$/, 'PIN must contain only digits');
