// ==============================================================
// SecureBank — Accounts Controller
// Handles HTTP requests and responses for the accounts module
// ==============================================================

import { Response, NextFunction } from 'express';
import { AccountsService } from './accounts.service';
import { AuthenticatedRequest } from '../../shared/types';
import path from 'path';
import fs from 'fs';

export class AccountsController {
  static async createAccount(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new Error('Unauthenticated');
      
      const userId = req.user.role === 'CLIENT' ? req.user.userId : (req.body.userId || req.user.userId);
      const { type, currency, label } = req.body;

      const account = await AccountsService.createAccount(userId, type, currency, label);
      
      res.status(201).json({
        success: true,
        data: account,
      });
    } catch (error) {
      next(error);
    }
  }

  static async listAccounts(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new Error('Unauthenticated');
      
      // Clients only see their own. Admins/Advisors can pass userId in query to see others (not fully implemented here for brevity).
      const userId = req.user.userId;
      
      const accounts = await AccountsService.listAccounts(userId);
      
      res.status(200).json({
        success: true,
        data: accounts,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getAccount(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new Error('Unauthenticated');
      
      const accountId = req.params.accountId;
      const account = await AccountsService.getAccount(accountId, req.user.userId, req.user.role);
      
      res.status(200).json({
        success: true,
        data: account,
      });
    } catch (error) {
      next(error);
    }
  }

  static async updateLimits(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new Error('Unauthenticated');
      
      const accountId = req.params.accountId;
      const { dailyLimit, monthlyLimit } = req.body;
      
      const account = await AccountsService.updateLimits(accountId, req.user.userId, req.user.role, { dailyLimit, monthlyLimit });
      
      res.status(200).json({
        success: true,
        data: account,
      });
    } catch (error) {
      next(error);
    }
  }

  static async closeAccount(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new Error('Unauthenticated');
      
      const accountId = req.params.accountId;
      const account = await AccountsService.closeAccount(accountId, req.user.userId, req.user.role);
      
      res.status(200).json({
        success: true,
        message: 'Account closed successfully',
        data: account,
      });
    } catch (error) {
      next(error);
    }
  }

  static async generateStatement(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new Error('Unauthenticated');
      
      const accountId = req.params.accountId;
      const format = (req.query.format as string)?.toUpperCase() === 'JSON' ? 'JSON' : 'PDF';
      
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
      
      const statement = await AccountsService.generateStatement(accountId, req.user.userId, req.user.role, startDate, endDate, format);
      
      if (format === 'JSON') {
        res.status(200).json({
          success: true,
          data: statement,
        });
      } else {
        // Return PDF file
        const filePath = statement as string;
        res.download(filePath, `statement-${accountId}.pdf`, (err) => {
          // Cleanup file after download
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        });
      }
    } catch (error) {
      next(error);
    }
  }
}
