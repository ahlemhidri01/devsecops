// ==============================================================
// SecureBank — IBAN Service
// Wrapper around shared IBAN generation and validation
// ==============================================================

import { generateIBAN, validateIBAN, encrypt, decrypt } from '../../shared/security';
import { prisma } from '../../shared/database';
import { AppError } from '../../shared/middleware';

export class IbanService {
  /**
   * Generates a unique, encrypted IBAN.
   */
  static async generateUniqueEncryptedIban(): Promise<string> {
    const maxAttempts = 5;
    
    for (let i = 0; i < maxAttempts; i++) {
      const iban = generateIBAN();
      const encryptedIban = encrypt(iban);
      
      // Check for uniqueness in DB
      const existing = await prisma.account.findUnique({
        where: { iban: encryptedIban },
      });
      
      if (!existing) {
        return encryptedIban;
      }
    }
    
    throw new AppError('Failed to generate a unique IBAN after multiple attempts', 500);
  }

  /**
   * Validates an external IBAN.
   */
  static validate(iban: string): boolean {
    return validateIBAN(iban);
  }
}
