// ==============================================================
// SecureBank — Error Handler Middleware
// Centralized error handling — no stack traces in production
// ==============================================================

import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { createModuleLogger } from '../logging';
import { ApiResponse } from '../types';
import { config } from '../config';

const logger = createModuleLogger('error-handler');

/**
 * Custom application error class.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_ERROR',
    isOperational: boolean = true
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

// Common error factory methods
export const Errors = {
  notFound: (resource: string) =>
    new AppError(`${resource} not found`, 404, 'RESOURCE_NOT_FOUND'),

  badRequest: (message: string) =>
    new AppError(message, 400, 'BAD_REQUEST'),

  unauthorized: (message: string = 'Authentication required') =>
    new AppError(message, 401, 'UNAUTHORIZED'),

  forbidden: (message: string = 'Access denied') =>
    new AppError(message, 403, 'FORBIDDEN'),

  conflict: (message: string) =>
    new AppError(message, 409, 'CONFLICT'),

  tooManyRequests: (message: string = 'Too many requests') =>
    new AppError(message, 429, 'RATE_LIMIT_EXCEEDED'),

  internal: (message: string = 'Internal server error') =>
    new AppError(message, 500, 'INTERNAL_ERROR', false),

  // Banking-specific errors
  insufficientFunds: () =>
    new AppError('Insufficient funds', 400, 'INSUFFICIENT_FUNDS'),

  accountLocked: () =>
    new AppError('Account is locked', 403, 'ACCOUNT_LOCKED'),

  mfaRequired: () =>
    new AppError('MFA verification required', 403, 'MFA_REQUIRED'),

  transferBlocked: (reason: string) =>
    new AppError(`Transfer blocked: ${reason}`, 403, 'TRANSFER_BLOCKED'),

  beneficiaryQuarantine: (hoursRemaining: number) =>
    new AppError(
      `Beneficiary is in quarantine period. ${hoursRemaining} hours remaining.`,
      403,
      'BENEFICIARY_QUARANTINE'
    ),

  fraudDetected: () =>
    new AppError('Transaction flagged for fraud review', 403, 'FRAUD_DETECTED'),

  duplicateTransaction: () =>
    new AppError('Duplicate transaction detected', 409, 'DUPLICATE_TRANSACTION'),
};

/**
 * Global error handler middleware.
 * Must be the LAST middleware registered.
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // ── Zod Validation Errors ──
  if (err instanceof ZodError) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: err.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        })),
      },
    };
    res.status(400).json(response);
    return;
  }

  // ── Prisma Errors ──
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    let statusCode = 500;
    let code = 'DATABASE_ERROR';
    let message = 'A database error occurred';

    switch (err.code) {
      case 'P2002': // Unique constraint violation
        statusCode = 409;
        code = 'DUPLICATE_ENTRY';
        message = 'A record with this value already exists';
        break;
      case 'P2025': // Record not found
        statusCode = 404;
        code = 'RESOURCE_NOT_FOUND';
        message = 'The requested resource was not found';
        break;
      case 'P2003': // Foreign key constraint
        statusCode = 400;
        code = 'REFERENCE_ERROR';
        message = 'Referenced resource does not exist';
        break;
    }

    const response: ApiResponse = {
      success: false,
      error: { code, message },
    };
    res.status(statusCode).json(response);
    return;
  }

  // ── Application Errors ──
  if (err instanceof AppError) {
    if (!err.isOperational) {
      logger.error('Non-operational error', {
        message: err.message,
        code: err.code,
        stack: err.stack,
        path: req.path,
        method: req.method,
      });
    }

    const response: ApiResponse = {
      success: false,
      error: {
        code: err.code,
        message: err.message,
      },
    };
    res.status(err.statusCode).json(response);
    return;
  }

  // ── Unknown Errors ──
  logger.error('Unhandled error', {
    message: err.message,
    stack: config.NODE_ENV === 'development' ? err.stack : undefined,
    path: req.path,
    method: req.method,
  });

  const response: ApiResponse = {
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message:
        config.NODE_ENV === 'production'
          ? 'An unexpected error occurred'
          : err.message,
    },
  };
  res.status(500).json(response);
}

/**
 * 404 handler for undefined routes.
 */
export function notFoundHandler(req: Request, res: Response): void {
  const response: ApiResponse = {
    success: false,
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
    },
  };
  res.status(404).json(response);
}
