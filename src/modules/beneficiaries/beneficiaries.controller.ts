// ==============================================================
// SecureBank — Beneficiaries Controller
// ==============================================================

import { Response, NextFunction } from 'express';
import { BeneficiariesService } from './beneficiaries.service';
import { AuthenticatedRequest } from '../../shared/types';

export class BeneficiariesController {
  static async addBeneficiary(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new Error('Unauthenticated');
      
      const ipAddress = req.ip;
      const userAgent = req.headers['user-agent'];

      const beneficiary = await BeneficiariesService.addBeneficiary(
        req.user.userId,
        req.body,
        ipAddress,
        userAgent
      );
      
      res.status(201).json({
        success: true,
        data: beneficiary,
      });
    } catch (error) {
      next(error);
    }
  }

  static async listBeneficiaries(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new Error('Unauthenticated');

      const beneficiaries = await BeneficiariesService.listBeneficiaries(req.user.userId);
      
      res.status(200).json({
        success: true,
        data: beneficiaries,
      });
    } catch (error) {
      next(error);
    }
  }

  static async updateBeneficiary(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new Error('Unauthenticated');
      
      const beneficiary = await BeneficiariesService.updateBeneficiary(
        req.params.id,
        req.user.userId,
        req.body
      );
      
      res.status(200).json({
        success: true,
        data: beneficiary,
      });
    } catch (error) {
      next(error);
    }
  }

  static async deleteBeneficiary(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new Error('Unauthenticated');
      
      await BeneficiariesService.deleteBeneficiary(req.params.id, req.user.userId);
      
      res.status(200).json({
        success: true,
        message: 'Beneficiary deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }
}
