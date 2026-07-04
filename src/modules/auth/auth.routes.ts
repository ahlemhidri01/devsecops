// ==============================================================
// SecureBank — Auth Routes
// Exposes endpoints with rate limiting, validation, and auth guards
// ==============================================================

import { Router } from 'express';
import { AuthController } from './auth.controller';
import { validate } from './auth.middleware';
import { authGuard, auditMiddleware, authRateLimiter, sensitiveRateLimiter } from '../../shared/middleware';
import {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  setupMfaSchema,
} from './auth.validators';

const router = Router();

// Apply auth rate limiter to all auth routes
router.use(authRateLimiter);

// ──────────────────────────────────────
// PUBLIC ROUTES
// ──────────────────────────────────────

router.post(
  '/register',
  validate(registerSchema),
  AuthController.register
);

router.post(
  '/login',
  validate(loginSchema),
  auditMiddleware('LOGIN_SUCCESS', 'User'), // The service logs failures manually, this logs success if it reaches end
  AuthController.login
);

router.post(
  '/refresh-token',
  validate(refreshTokenSchema),
  AuthController.refreshToken
);

// ──────────────────────────────────────
// PROTECTED ROUTES
// ──────────────────────────────────────

router.post(
  '/logout',
  authGuard(),
  auditMiddleware('LOGOUT', 'User'),
  AuthController.logout
);

router.post(
  '/logout-all',
  authGuard(),
  auditMiddleware('LOGOUT_ALL', 'User'),
  AuthController.logoutAll
);

// ──────────────────────────────────────
// MFA SETTINGS
// ──────────────────────────────────────

router.post(
  '/mfa/setup',
  authGuard(),
  sensitiveRateLimiter,
  AuthController.generateMfa
);

router.post(
  '/mfa/verify',
  authGuard(),
  sensitiveRateLimiter,
  validate(setupMfaSchema),
  auditMiddleware('MFA_ENABLED', 'MfaSecret'),
  AuthController.verifyAndEnableMfa
);

export { router as authRoutes };
