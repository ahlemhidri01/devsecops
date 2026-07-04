// ==============================================================
// SecureBank — Auth Module Middleware
// MFA Enforcement and generic Zod validation wrapper
// ==============================================================

import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError } from 'zod';
import { prisma } from '../../shared/database';
import { Errors } from '../../shared/middleware';
import { AuthenticatedRequest } from '../../shared/types';
import { createModuleLogger } from '../../shared/logging';

const logger = createModuleLogger('auth-middleware');

/**
 * Validates request data against a Zod schema.
 */
export const validate = (schema: AnyZodObject) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      return next();
    } catch (error) {
      if (error instanceof ZodError) {
        // Create an array of error details
        const details = error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        }));
        
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Request validation failed',
            details,
          },
        });
      }
      return next(error);
    }
  };
};

/**
 * Middleware to enforce that the user has MFA enabled.
 * Should be placed after authGuard.
 */
export const enforceMfaSetup = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return next(Errors.unauthorized());
    }

    const mfaSecret = await prisma.mfaSecret.findUnique({
      where: { userId: req.user.userId },
    });

    if (!mfaSecret || !mfaSecret.enabled) {
      logger.warn('MFA setup enforced but not enabled for user', { userId: req.user.userId });
      return next(Errors.forbidden('MFA setup is required to access this resource.'));
    }

    next();
  } catch (error) {
    next(error);
  }
};
