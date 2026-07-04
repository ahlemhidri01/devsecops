// ==============================================================
// SecureBank — MFA Service (TOTP)
// Generates secrets, validates codes, manages backup codes
// ==============================================================

import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import crypto from 'crypto';
import { prisma } from '../../shared/database';
import { config } from '../../shared/config';
import { encrypt, decrypt } from '../../shared/security';
import { AppError } from '../../shared/middleware';

export class MfaService {
  /**
   * Generates a new TOTP secret and returns the QR code data URL.
   * Does NOT enable MFA yet (requires verification).
   */
  static async generateSecret(userId: string, email: string) {
    // Generate TOTP secret
    const secret = speakeasy.generateSecret({
      name: `${config.MFA_ISSUER} (${email})`,
      length: 20,
    });

    // Encrypt the base32 secret before storing
    const encryptedSecret = encrypt(secret.base32);

    // Upsert the MFA record (disabled by default)
    await prisma.mfaSecret.upsert({
      where: { userId },
      update: {
        secret: encryptedSecret,
        enabled: false,
      },
      create: {
        userId,
        secret: encryptedSecret,
        enabled: false,
      },
    });

    // Generate QR Code
    if (!secret.otpauth_url) {
      throw new AppError('Failed to generate MFA secret', 500);
    }

    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

    return {
      secret: secret.base32,
      qrCodeUrl,
    };
  }

  /**
   * Verifies a TOTP code and enables MFA if successful.
   * Generates and returns backup codes.
   */
  static async verifyAndEnable(userId: string, code: string) {
    const mfaRecord = await prisma.mfaSecret.findUnique({
      where: { userId },
    });

    if (!mfaRecord) {
      throw new AppError('MFA setup not initiated', 400);
    }

    const decryptedSecret = decrypt(mfaRecord.secret);

    const isValid = speakeasy.totp.verify({
      secret: decryptedSecret,
      encoding: 'base32',
      token: code,
      window: 1, // Allow 1 step (30s) before/after
    });

    if (!isValid) {
      throw new AppError('Invalid TOTP code', 400, 'INVALID_MFA_CODE');
    }

    // Generate 10 backup codes
    const backupCodes = Array.from({ length: 10 }, () => crypto.randomBytes(4).toString('hex'));
    const encryptedBackupCodes = backupCodes.map(code => encrypt(code));

    await prisma.mfaSecret.update({
      where: { userId },
      data: {
        enabled: true,
        backupCodes: encryptedBackupCodes,
      },
    });

    return { backupCodes };
  }

  /**
   * Verifies a TOTP code for login/transaction without modifying state.
   */
  static async verifyCode(userId: string, code: string): Promise<boolean> {
    const mfaRecord = await prisma.mfaSecret.findUnique({
      where: { userId },
    });

    if (!mfaRecord || !mfaRecord.enabled) {
      return false;
    }

    const decryptedSecret = decrypt(mfaRecord.secret);

    const isValidTotp = speakeasy.totp.verify({
      secret: decryptedSecret,
      encoding: 'base32',
      token: code,
      window: 1,
    });

    if (isValidTotp) {
      return true;
    }

    // Check backup codes
    const validBackupCodeIndex = mfaRecord.backupCodes.findIndex(
      encryptedCode => decrypt(encryptedCode) === code
    );

    if (validBackupCodeIndex !== -1) {
      // Remove used backup code
      const newBackupCodes = [...mfaRecord.backupCodes];
      newBackupCodes.splice(validBackupCodeIndex, 1);

      await prisma.mfaSecret.update({
        where: { userId },
        data: { backupCodes: newBackupCodes },
      });

      return true;
    }

    return false;
  }
}
