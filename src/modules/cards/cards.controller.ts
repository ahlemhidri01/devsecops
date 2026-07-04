// ==============================================================
// SecureBank — Cards Controller
// ==============================================================

import { Response, NextFunction } from 'express';
import { CardsService } from './cards.service';
import { AuthenticatedRequest } from '../../shared/types';

export class CardsController {
  static async createCard(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new Error('Unauthenticated');
      
      const { accountId, type, isSingleUse } = req.body;

      const card = await CardsService.createCard(
        req.user.userId,
        accountId,
        type,
        isSingleUse
      );
      
      res.status(201).json({
        success: true,
        data: card,
      });
    } catch (error) {
      next(error);
    }
  }

  static async listCards(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new Error('Unauthenticated');

      const cards = await CardsService.listCards(req.user.userId);
      
      res.status(200).json({
        success: true,
        data: cards,
      });
    } catch (error) {
      next(error);
    }
  }

  static async blockCard(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new Error('Unauthenticated');
      
      const result = await CardsService.blockCard(req.params.id, req.user.userId);
      
      res.status(200).json({
        success: true,
        ...result
      });
    } catch (error) {
      next(error);
    }
  }

  static async updateSettings(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new Error('Unauthenticated');
      
      const card = await CardsService.updateSettings(
        req.params.id,
        req.user.userId,
        req.body
      );
      
      res.status(200).json({
        success: true,
        data: card,
      });
    } catch (error) {
      next(error);
    }
  }

  static async setPin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new Error('Unauthenticated');
      
      const result = await CardsService.setPin(
        req.params.id,
        req.user.userId,
        req.body.pin
      );
      
      res.status(200).json({
        success: true,
        ...result
      });
    } catch (error) {
      next(error);
    }
  }
}
