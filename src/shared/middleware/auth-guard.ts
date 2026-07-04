// ==============================================================
// SecureBank — Authentication Guard Middleware
// JWT verification + RBAC role enforcement
// ==============================================================

import { Response, NextFunction } from 'express';
import { UserRole } from '@prisma/client';
import { verifyToken } from '../security';
import { isTokenBlacklisted } from '../database/redis';
import { createModuleLogger } from '../logging';
import { AuthenticatedRequest, ApiResponse } from '../types';

const logger = createModuleLogger('auth-guard');

/**
 * JWT authentication middleware.
 * Verifies the access token from the Authorization header.
 * Attaches the decoded user payload to req.user.
 */
export function authGuard() {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'AUTH_TOKEN_MISSING',
            message: 'Access token is required',
          },
        };
        res.status(401).json(response);
        return;
      }

      const token = authHeader.split(' ')[1];

      // Check if token is blacklisted (logged out)
      const blacklisted = await isTokenBlacklisted(token);
      if (blacklisted) {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'AUTH_TOKEN_REVOKED',
            message: 'Token has been revoked',
          },
        };
        res.status(401).json(response);
        return;
      }

      // Verify and decode token
      const decoded = verifyToken(token);

      if (decoded.type !== 'access') {
        const response: ApiResponse = {
          success: false,
          error: {
            code: 'AUTH_INVALID_TOKEN_TYPE',
            message: 'Invalid token type',
          },
        };
        res.status(401).json(response);
        return;
      }

      // Attach user info to request
      req.user = {
        userId: decoded.userId,
        email: decoded.email,
        role: decoded.role as UserRole,
      };

      next();
    } catch (error) {
      logger.warn('Authentication failed', {
        ip: req.ip,
        path: req.path,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      const response: ApiResponse = {
        success: false,
        error: {
          code: 'AUTH_TOKEN_INVALID',
          message: 'Invalid or expired access token',
        },
      };
      res.status(401).json(response);
    }
  };
}

/**
 * RBAC role authorization middleware.
 * Must be used AFTER authGuard().
 * Restricts access to specified roles.
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'AUTH_NOT_AUTHENTICATED',
          message: 'Authentication required',
        },
      };
      res.status(401).json(response);
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      logger.warn('Unauthorized access attempt', {
        userId: req.user.userId,
        role: req.user.role,
        requiredRoles: allowedRoles,
        path: req.path,
        method: req.method,
      });

      const response: ApiResponse = {
        success: false,
        error: {
          code: 'AUTH_INSUFFICIENT_PERMISSIONS',
          message: 'You do not have permission to access this resource',
        },
      };
      res.status(403).json(response);
      return;
    }

    next();
  };
}

/**
 * Resource ownership middleware.
 * Ensures users can only access their own resources (unless ADMIN/AUDITOR).
 */
export function requireOwnership(userIdParam: string = 'userId') {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: { code: 'AUTH_NOT_AUTHENTICATED', message: 'Authentication required' },
      });
      return;
    }

    const resourceUserId = req.params[userIdParam] || req.body?.[userIdParam];

    // Admins and auditors can access any resource
    if (req.user.role === 'ADMIN' || req.user.role === 'AUDITOR') {
      next();
      return;
    }

    // Advisors can access their clients' resources (additional check needed at service level)
    if (req.user.role === 'ADVISOR') {
      next();
      return;
    }

    // Clients can only access their own resources
    if (resourceUserId && resourceUserId !== req.user.userId) {
      logger.warn('Ownership violation attempt', {
        userId: req.user.userId,
        attemptedUserId: resourceUserId,
        path: req.path,
      });

      res.status(403).json({
        success: false,
        error: { code: 'AUTH_OWNERSHIP_VIOLATION', message: 'Access denied' },
      });
      return;
    }

    next();
  };
}
