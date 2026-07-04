// ==============================================================
// SecureBank — Compliance Controller
// ==============================================================

import { Response, NextFunction } from 'express';
import { ComplianceService } from './compliance.service';
import { AuthenticatedRequest } from '../../shared/types';
import fs from 'fs';

export class ComplianceController {
  static async exportAuditTrail(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new Error('Unauthenticated');
      
      const filePath = await ComplianceService.exportUserAuditTrail(req.user.userId);
      
      res.download(filePath, `audit-export-${req.user.userId}.json.enc`, (err) => {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath); // Delete after download
        }
      });
    } catch (error) {
      next(error);
    }
  }

  static async rightToBeForgotten(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new Error('Unauthenticated');
      
      await ComplianceService.executeRightToBeForgotten(req.user.userId);
      
      res.status(200).json({
        success: true,
        message: 'Your personal data has been deleted and anonymized according to GDPR guidelines. Financial records will be kept as per legal requirements.',
      });
    } catch (error) {
      next(error);
    }
  }

  static async getDoraReport(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      // Must be AUDITOR or ADMIN
      if (!req.user || (req.user.role !== 'ADMIN' && req.user.role !== 'AUDITOR')) {
        return res.status(403).json({ success: false, error: { message: 'Insufficient permissions' } });
      }

      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : new Date();

      const report = await ComplianceService.generateDoraIncidentReport(startDate, endDate);
      
      res.status(200).json({
        success: true,
        data: report,
      });
    } catch (error) {
      next(error);
    }
  }
}
