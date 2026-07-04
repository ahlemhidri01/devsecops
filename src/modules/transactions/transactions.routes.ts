// ==============================================================
// SecureBank — Transactions Routes
// ==============================================================

import { Router } from 'express';
import { TransactionsController } from './transactions.controller';
import { validate } from '../auth/auth.middleware'; 
import { authGuard } from '../../shared/middleware';
import { initiateTransferSchema, getTransactionsSchema } from './transactions.validators';

const router = Router();

router.use(authGuard());

router.post(
  '/transfer',
  validate(initiateTransferSchema),
  // Audit logged within service
  TransactionsController.initiateTransfer
);

router.get(
  '/',
  validate(getTransactionsSchema),
  TransactionsController.getTransactions
);

export { router as transactionRoutes };
