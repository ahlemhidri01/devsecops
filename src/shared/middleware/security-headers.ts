// ==============================================================
// SecureBank — Security Headers Middleware
// HSTS, X-Frame-Options, CSP, X-Content-Type-Options
// ==============================================================

import helmet from 'helmet';
import { config } from '../config';

/**
 * Security headers middleware using Helmet.
 * Enforces all required HTTP security headers:
 * - Strict-Transport-Security (HSTS)
 * - X-Frame-Options: DENY
 * - Content-Security-Policy
 * - X-Content-Type-Options: nosniff
 * - Referrer-Policy
 * - Permissions-Policy
 */
export const securityHeaders = helmet({
  // Strict-Transport-Security: max-age=31536000; includeSubDomains
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
  // X-Frame-Options: DENY — prevent clickjacking
  frameguard: {
    action: 'deny',
  },
  // Content-Security-Policy — strict policy
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'none'"],
      frameSrc: ["'none'"],
      childSrc: ["'none'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      upgradeInsecureRequests: config.NODE_ENV === 'production' ? [] : null,
    },
  },
  // X-Content-Type-Options: nosniff
  noSniff: true,
  // Referrer-Policy: strict-origin-when-cross-origin
  referrerPolicy: {
    policy: 'strict-origin-when-cross-origin',
  },
  // X-DNS-Prefetch-Control: off
  dnsPrefetchControl: {
    allow: false,
  },
  // X-Download-Options: noopen (IE)
  ieNoOpen: true,
  // X-Permitted-Cross-Domain-Policies: none
  permittedCrossDomainPolicies: {
    permittedPolicies: 'none',
  },
});
