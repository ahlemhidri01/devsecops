// ==============================================================
// SecureBank — Tokenization Service (PCI-DSS)
// ==============================================================

import { encrypt, decrypt } from '../../shared/security';
import { AppError } from '../../shared/middleware';

export class TokenizationService {
  /**
   * Tokenizes a Primary Account Number (PAN).
   * In a real PCI-DSS compliant system, this would interact with an external Vault.
   * Here, we use strong AES-256 encryption.
   */
  static tokenizePan(pan: string): string {
    // Basic Luhn check could be done here before tokenization
    return encrypt(pan);
  }

  /**
   * Retrieves the original PAN from a token.
   * This operation should be heavily restricted and audited.
   */
  static detokenizePan(token: string): string {
    try {
      return decrypt(token);
    } catch (error) {
      throw new AppError('Failed to detokenize PAN', 500);
    }
  }

  /**
   * Generates a new PAN (mock implementation).
   */
  static generatePan(cardType: 'VISA' | 'MASTERCARD'): string {
    const prefix = cardType === 'VISA' ? '4' : '5';
    let pan = prefix;
    for (let i = 1; i < 15; i++) {
      pan += Math.floor(Math.random() * 10).toString();
    }
    // Calculate 16th digit (Luhn checksum)
    pan += this.calculateLuhnDigit(pan);
    return pan;
  }

  private static calculateLuhnDigit(partialPan: string): string {
    let sum = 0;
    let isSecond = true; // We are calculating the check digit, so we start doubling from the rightmost digit of the partial PAN
    
    for (let i = partialPan.length - 1; i >= 0; i--) {
      let d = parseInt(partialPan.charAt(i), 10);
      if (isSecond) {
        d = d * 2;
        if (d > 9) d -= 9;
      }
      sum += d;
      isSecond = !isSecond;
    }
    
    return ((10 - (sum % 10)) % 10).toString();
  }

  /**
   * Generates a CVV.
   */
  static generateCvv(): string {
    return Math.floor(100 + Math.random() * 900).toString();
  }
}
