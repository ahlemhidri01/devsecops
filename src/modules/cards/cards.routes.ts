// ==============================================================
// SecureBank — Cards Routes
// ==============================================================

import { Router } from 'express';
import { CardsController } from './cards.controller';
import { validate } from '../auth/auth.middleware'; 
import { authGuard } from '../../shared/middleware';
import { createCardSchema, updateCardSettingsSchema, setPinSchema } from './cards.validators';

const router = Router();

router.use(authGuard());

router.post(
  '/',
  validate(createCardSchema),
  CardsController.createCard
);

router.get(
  '/',
  CardsController.listCards
);

router.post(
  '/:id/block',
  CardsController.blockCard
);

router.patch(
  '/:id/settings',
  validate(updateCardSettingsSchema),
  CardsController.updateSettings
);

router.post(
  '/:id/pin',
  validate(setPinSchema),
  CardsController.setPin
);

export { router as cardRoutes };
