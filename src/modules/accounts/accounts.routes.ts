// ==============================================================
// SecureBank — Accounts Routes
// ==============================================================

import { Router } from 'express';
import { AccountsController } from './accounts.controller';
import { validate } from '../auth/auth.middleware'; // Reusing generic validation middleware
import { authGuard, auditMiddleware } from '../../shared/middleware';
import {
  createAccountSchema,
  updateAccountLimitsSchema,
  getAccountStatementsSchema,
} from './accounts.validators';

const router = Router();

// All account routes require authentication
router.use(authGuard());

// ──────────────────────────────────────
// ACCOUNT MANAGEMENT
// ──────────────────────────────────────

router.post(
  '/',
  validate(createAccountSchema),
  // Audit logged within service due to transaction
  AccountsController.createAccount
);

router.get(
  '/',
  AccountsController.listAccounts
);

router.get(
  '/:accountId',
  AccountsController.getAccount
);

router.patch(
  '/:accountId/limits',
  validate(updateAccountLimitsSchema),
  AccountsController.updateLimits
);

router.post(
  '/:accountId/close',
  AccountsController.closeAccount
);

// ──────────────────────────────────────
// STATEMENTS
// ──────────────────────────────────────

router.get(
  '/:accountId/statements',
  validate(getAccountStatementsSchema),
  AccountsController.generateStatement
);

export { router as accountRoutes };
