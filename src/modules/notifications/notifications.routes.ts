// ==============================================================
// SecureBank — Notifications Routes
// ==============================================================

import { Router } from 'express';
import { NotificationsController } from './notifications.controller';
import { authGuard } from '../../shared/middleware';

const router = Router();

router.use(authGuard());

router.get('/', NotificationsController.getNotifications);
router.patch('/:id/read', NotificationsController.markAsRead);

export { router as notificationRoutes };
