// ==============================================================
// SecureBank — Rate Limiter Middleware
// Protection against brute force attacks
// ==============================================================

import rateLimit from 'express-rate-limit';
import { config } from '../config';
import { ApiResponse } from '../types';
import { createModuleLogger } from '../logging';

const logger = createModuleLogger('rate-limiter');

/**
 * Rate limiter for authentication endpoints.
 * 5 requests per minute per IP on /auth/* routes.
 */
export const authRateLimiter = rateLimit({
  windowMs: config.AUTH_RATE_LIMIT_WINDOW_MS, // 1 minute
  max: config.AUTH_RATE_LIMIT_MAX, // 5 requests
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Use X-Forwarded-For in production (behind reverse proxy)
    return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'unknown';
  },
  handler: (req, res) => {
    logger.warn('Rate limit exceeded on auth endpoint', {
      ip: req.ip,
      path: req.path,
      method: req.method,
    });

    const response: ApiResponse = {
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please try again later.',
      },
    };
    res.status(429).json(response);
  },
  skip: (_req) => {
    // Skip rate limiting in test environment
    return config.NODE_ENV === 'development' && process.env.SKIP_RATE_LIMIT === 'true';
  },
});

/**
 * General API rate limiter.
 * 100 requests per minute per IP.
 */
export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'unknown';
  },
  handler: (_req, res) => {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please try again later.',
      },
    };
    res.status(429).json(response);
  },
});

/**
 * Strict rate limiter for sensitive operations (password reset, MFA setup).
 * 3 requests per 15 minutes per IP.
 */
export const sensitiveRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'unknown';
  },
  handler: (req, res) => {
    logger.warn('Sensitive rate limit exceeded', {
      ip: req.ip,
      path: req.path,
    });

    const response: ApiResponse = {
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many attempts. Please try again later.',
      },
    };
    res.status(429).json(response);
  },
});
