// ==============================================================
// SecureBank — Notifications Controller
// ==============================================================

import { Response, NextFunction } from 'express';
import { prisma } from '../../shared/database';
import { AuthenticatedRequest } from '../../shared/types';

export class NotificationsController {
  static async getNotifications(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new Error('Unauthenticated');
      
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = parseInt(req.query.offset as string) || 0;

      const notifications = await prisma.notification.findMany({
        where: { userId: req.user.userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      });
      
      res.status(200).json({
        success: true,
        data: notifications,
      });
    } catch (error) {
      next(error);
    }
  }

  static async markAsRead(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new Error('Unauthenticated');
      
      const notificationId = req.params.id;
      
      const notification = await prisma.notification.findUnique({
        where: { id: notificationId }
      });

      if (!notification || notification.userId !== req.user.userId) {
        return res.status(404).json({ success: false, error: { message: 'Not found' }});
      }

      const updated = await prisma.notification.update({
        where: { id: notificationId },
        data: { readAt: new Date() }
      });
      
      res.status(200).json({
        success: true,
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  }
}
