// ==============================================================
// SecureBank — Beneficiaries Service
// ==============================================================

import { prisma } from '../../shared/database';
import { AppError } from '../../shared/middleware';
import { config } from '../../shared/config';
import { encrypt, decrypt, maskIBAN } from '../../shared/security';
import { MfaService } from '../auth/mfa.service';
import { QuarantineService } from './quarantine.service';
import { IbanService } from '../accounts/iban.service';
import { publishEvent, KAFKA_TOPICS } from '../../shared/kafka';
import { logAuditEvent } from '../../shared/middleware';

export class BeneficiariesService {
  /**
   * Adds a new beneficiary with MFA verification and 72h quarantine.
   */
  static async addBeneficiary(
    userId: string,
    data: {
      name: string;
      iban: string;
      bic?: string;
      bankName?: string;
      totpCode: string;
    },
    ipAddress?: string,
    device?: string
  ) {
    // 1. Verify MFA (Strict requirement for adding beneficiaries)
    const isValidMfa = await MfaService.verifyCode(userId, data.totpCode);
    if (!isValidMfa) {
      throw new AppError('Invalid MFA code', 401);
    }

    // 2. Validate IBAN format (SEPA check)
    if (!IbanService.validate(data.iban)) {
      throw new AppError('Invalid IBAN format', 400);
    }

    // 3. Check max beneficiaries limit
    const currentCount = await prisma.beneficiary.count({
      where: { userId, isActive: true },
    });

    if (currentCount >= config.MAX_BENEFICIARIES_PER_CLIENT) {
      throw new AppError(`Maximum limit of ${config.MAX_BENEFICIARIES_PER_CLIENT} active beneficiaries reached`, 403);
    }

    // 4. Check if already exists
    const encryptedIban = encrypt(data.iban.replace(/\s/g, '').toUpperCase());
    const existing = await prisma.beneficiary.findFirst({
      where: { userId, iban: encryptedIban },
    });

    if (existing) {
      throw new AppError('Beneficiary with this IBAN already exists', 409);
    }

    // 5. Create with 72h quarantine
    const quarantineUntil = QuarantineService.calculateQuarantineEnd();

    const beneficiary = await prisma.beneficiary.create({
      data: {
        userId,
        name: data.name,
        iban: encryptedIban,
        bic: data.bic,
        bankName: data.bankName,
        quarantineUntil,
        addedFromIp: ipAddress,
        addedFromDevice: device,
      },
    });

    await logAuditEvent('BENEFICIARY_ADDED', 'Beneficiary', beneficiary.id, userId, { maskedIban: maskIBAN(data.iban) }, ipAddress || null, device || null);
    
    // 6. Send notifications (Email + SMS) via Kafka
    await publishEvent(KAFKA_TOPICS.BENEFICIARY_EVENTS, 'BENEFICIARY_ADDED', {
      beneficiaryId: beneficiary.id,
      userId,
      maskedIban: maskIBAN(data.iban),
      device,
      ipAddress
    });

    return this.formatBeneficiaryResponse(beneficiary);
  }

  /**
   * Lists all active beneficiaries for a user.
   */
  static async listBeneficiaries(userId: string) {
    const beneficiaries = await prisma.beneficiary.findMany({
      where: { userId, isActive: true },
      orderBy: { name: 'asc' },
    });

    return beneficiaries.map(b => this.formatBeneficiaryResponse(b));
  }

  /**
   * Updates beneficiary details (Name only, not IBAN).
   */
  static async updateBeneficiary(id: string, userId: string, data: { name?: string, isActive?: boolean }) {
    const beneficiary = await prisma.beneficiary.findUnique({ where: { id } });

    if (!beneficiary) throw new AppError('Beneficiary not found', 404);
    if (beneficiary.userId !== userId) throw new AppError('Access denied', 403);

    const updated = await prisma.beneficiary.update({
      where: { id },
      data,
    });

    await logAuditEvent('BENEFICIARY_MODIFIED', 'Beneficiary', id, userId, data, null, null);

    return this.formatBeneficiaryResponse(updated);
  }

  /**
   * Deletes (soft or hard) a beneficiary.
   */
  static async deleteBeneficiary(id: string, userId: string) {
    const beneficiary = await prisma.beneficiary.findUnique({ where: { id } });

    if (!beneficiary) throw new AppError('Beneficiary not found', 404);
    if (beneficiary.userId !== userId) throw new AppError('Access denied', 403);

    await prisma.beneficiary.delete({
      where: { id },
    });

    await logAuditEvent('BENEFICIARY_DELETED', 'Beneficiary', id, userId, null, null, null);
    
    return { success: true };
  }

  private static formatBeneficiaryResponse(beneficiary: any) {
    const decryptedIban = decrypt(beneficiary.iban);
    
    return {
      id: beneficiary.id,
      name: beneficiary.name,
      iban: decryptedIban, // Full IBAN returned to owner
      maskedIban: maskIBAN(decryptedIban),
      bic: beneficiary.bic,
      bankName: beneficiary.bankName,
      isActive: beneficiary.isActive,
      quarantineUntil: beneficiary.quarantineUntil,
      isInQuarantine: QuarantineService.isStillInQuarantine(beneficiary.quarantineUntil),
      createdAt: beneficiary.createdAt,
    };
  }
}
