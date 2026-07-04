// ==============================================================
// SecureBank — Compliance Service (DORA / NIS2 / PCI-DSS)
// ==============================================================

import { prisma } from '../../shared/database';
import { createModuleLogger } from '../../shared/logging';
import { encrypt } from '../../shared/security';
import fs from 'fs';
import path from 'path';

const logger = createModuleLogger('compliance-service');

export class ComplianceService {
  /**
   * Exports an audit trail for a specific user (RGPD / GDPR Right to Access).
   */
  static async exportUserAuditTrail(userId: string): Promise<string> {
    const auditLogs = await prisma.auditLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    const fileName = `audit-${userId}-${Date.now()}.json`;
    const tmpDir = path.join(process.cwd(), 'tmp', 'exports');
    
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    const filePath = path.join(tmpDir, fileName);
    
    // Encrypt the export file at rest (PCI-DSS/GDPR requirement for PII)
    const data = JSON.stringify(auditLogs, null, 2);
    const encryptedData = encrypt(data);

    fs.writeFileSync(filePath, encryptedData);

    logger.info('User audit trail exported', { userId, file: fileName });

    return filePath;
  }

  /**
   * Generates a DORA compliance incident report.
   * Pulls data from audit logs marked as SYSTEM_ERROR or SECURITY_INCIDENT.
   */
  static async generateDoraIncidentReport(startDate: Date, endDate: Date) {
    const incidents = await prisma.auditLog.findMany({
      where: {
        action: {
          in: ['SYSTEM_ERROR', 'SECURITY_INCIDENT', 'FRAUD_DETECTED'] as any
        },
        createdAt: {
          gte: startDate,
          lte: endDate,
        }
      }
    });

    return {
      period: { startDate, endDate },
      totalIncidents: incidents.length,
      incidents: incidents.map(i => ({
        id: i.id,
        timestamp: i.createdAt,
        type: i.action,
        entity: i.entity,
        // Omit PII from aggregate report
      })),
      generatedAt: new Date(),
    };
  }

  /**
   * Deletes a user and anonymizes their data (GDPR Right to be Forgotten).
   * Note: Financial records (transactions) must be kept for 5-10 years by law.
   * This method anonymizes the user record but preserves financial integrity.
   */
  static async executeRightToBeForgotten(userId: string) {
    return await prisma.$transaction(async (tx) => {
      // 1. Close all active accounts
      await tx.account.updateMany({
        where: { userId, status: 'ACTIVE' },
        data: { status: 'CLOSED', closedAt: new Date() },
      });

      // 2. Block all cards
      await tx.card.updateMany({
        where: { userId, status: 'ACTIVE' },
        data: { status: 'BLOCKED', blockedAt: new Date() },
      });

      // 3. Delete personal data (KYC, Beneficiaries)
      await tx.kycDocument.deleteMany({ where: { userId } });
      await tx.beneficiary.deleteMany({ where: { userId } });

      // 4. Anonymize user record (Scramble PII)
      const deletedUser = await tx.user.update({
        where: { id: userId },
        data: {
          email: `deleted-${userId}@securebank.local`,
          firstName: 'DELETED',
          lastName: 'USER',
          phone: null,
          status: 'CLOSED',
          passwordHash: 'DELETED',
        },
      });

      // 5. Log the deletion in the immutable audit trail (SYSTEM user)
      await tx.auditLog.create({
        data: {
          action: 'USER_DELETED' as any,
          entity: 'User',
          entityId: userId,
          userId: 'SYSTEM',
        }
      });

      return deletedUser;
    });
  }
}
