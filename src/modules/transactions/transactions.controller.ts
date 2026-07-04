// ==============================================================
// SecureBank — Transactions Controller
// ==============================================================

import { Response, NextFunction } from 'express';
import { TransactionsService } from './transactions.service';
import { AuthenticatedRequest } from '../../shared/types';

export class TransactionsController {
  static async initiateTransfer(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new Error('Unauthenticated');
      
      const ipAddress = req.ip;
      const userAgent = req.headers['user-agent'];

      const transaction = await TransactionsService.initiateTransaction(
        req.user.userId,
        req.body,
        ipAddress,
        userAgent
      );
      
      res.status(201).json({
        success: true,
        data: transaction,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getTransactions(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new Error('Unauthenticated');
      
      const { accountId, type, status, startDate, endDate, page, limit } = req.query;

      const result = await TransactionsService.getTransactions(
        req.user.userId,
        {
          accountId: accountId as string,
          type: type as any,
          status: status as any,
          startDate: startDate ? new Date(startDate as string) : undefined,
          endDate: endDate ? new Date(endDate as string) : undefined,
          page: page ? parseInt(page as string, 10) : 1,
          limit: limit ? parseInt(limit as string, 10) : 20,
        }
      );
      
      res.status(200).json({
        success: true,
        data: result.transactions,
        meta: result.meta,
      });
    } catch (error) {
      next(error);
    }
  }
}
