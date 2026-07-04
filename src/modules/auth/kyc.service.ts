// ==============================================================
// SecureBank — KYC Service
// Manages document uploads and verification statuses
// ==============================================================

import { KycDocumentType, KycStatus, UserStatus } from '@prisma/client';
import { prisma } from '../../shared/database';
import { AppError } from '../../shared/middleware';
import { logAuditEvent } from '../../shared/middleware';

export class KycService {
  /**
   * Mock implementation for uploading a KYC document.
   * In a real banking app, this would upload to S3 (encrypted) and trigger
   * an external KYC provider (e.g., Onfido, Jumio) via webhook.
   */
  static async uploadDocument(userId: string, type: KycDocumentType, fileBuffer: Buffer, fileName: string) {
    // 1. In reality, encrypt fileBuffer and upload to secure blob storage.
    // We'll simulate a file path here.
    const mockFilePath = `s3://securebank-kyc/${userId}/${Date.now()}-${fileName}`;

    // 2. Save document record
    const document = await prisma.kycDocument.create({
      data: {
        userId,
        type,
        status: KycStatus.PENDING,
        filePath: mockFilePath,
      },
    });

    await logAuditEvent('KYC_DOCUMENT_UPLOADED', 'KycDocument', document.id, userId, { type }, null, null);

    return document;
  }

  /**
   * Mock implementation for verifying KYC documents.
   * This would typically be called by a webhook from the KYC provider.
   */
  static async verifyDocument(documentId: string, status: KycStatus, reviewerId?: string) {
    const document = await prisma.kycDocument.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      throw new AppError('KYC document not found', 404);
    }

    const updatedDocument = await prisma.kycDocument.update({
      where: { id: documentId },
      data: {
        status,
        verifiedAt: status === KycStatus.VERIFIED ? new Date() : null,
      },
    });

    await logAuditEvent('KYC_VERIFIED', 'KycDocument', documentId, reviewerId || 'SYSTEM', { status }, null, null);

    // Check if user has all required documents verified to activate account
    await this.checkAndUpdateUserStatus(document.userId);

    return updatedDocument;
  }

  /**
   * Checks if user has required verified documents (e.g., CNI or PASSPORT + PROOF_OF_ADDRESS)
   * and updates user status to ACTIVE if so.
   */
  private static async checkAndUpdateUserStatus(userId: string) {
    const documents = await prisma.kycDocument.findMany({
      where: { userId, status: KycStatus.VERIFIED },
    });

    const hasIdentity = documents.some(d => d.type === 'CNI' || d.type === 'PASSPORT');
    const hasAddress = documents.some(d => d.type === 'PROOF_OF_ADDRESS');

    if (hasIdentity && hasAddress) {
      await prisma.user.update({
        where: { id: userId },
        data: { status: UserStatus.ACTIVE },
      });
      // Further actions: Create default current account, etc.
    }
  }
}
