// ==============================================================
// SecureBank — Winston Logger with PII Masking
// Structured JSON logs, RGPD-compliant
// ==============================================================

import winston from 'winston';
import { config } from '../config';
import { maskIBAN, maskPAN, maskEmail } from '../security';

/**
 * PII masking format — replaces sensitive data patterns in log output.
 * Ensures RGPD compliance: no personal data in plain text in logs.
 */
const piiMaskingFormat = winston.format((info) => {
  const stringified = JSON.stringify(info);

  let masked = stringified;

  // Mask IBAN patterns (FR followed by digits/letters)
  masked = masked.replace(
    /\b([A-Z]{2}\d{2}[A-Z0-9]{10,30})\b/g,
    (match) => {
      if (/^[A-Z]{2}\d{2}/.test(match) && match.length >= 15) {
        return maskIBAN(match);
      }
      return match;
    }
  );

  // Mask card PAN patterns (13-19 digit sequences)
  masked = masked.replace(
    /\b(\d{13,19})\b/g,
    (match) => maskPAN(match)
  );

  // Mask email patterns
  masked = masked.replace(
    /\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/g,
    (match) => maskEmail(match)
  );

  return JSON.parse(masked);
});

/**
 * Custom log format for structured JSON logging.
 */
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'ISO' }),
  winston.format.errors({ stack: true }),
  piiMaskingFormat(),
  config.LOG_FORMAT === 'json'
    ? winston.format.json()
    : winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
          return `${timestamp} [${level}]: ${message}${metaStr}`;
        })
      )
);

/**
 * Application logger instance.
 * - Production: JSON format, WARN level, no color
 * - Development: Simple format, DEBUG level, colorized
 */
export const logger = winston.createLogger({
  level: config.LOG_LEVEL,
  format: logFormat,
  defaultMeta: {
    service: 'securebank-api',
    environment: config.NODE_ENV,
  },
  transports: [
    new winston.transports.Console({
      silent: false,
    }),
  ],
  // Never exit on uncaught exceptions in production
  exitOnError: false,
});

// Add file transport in non-test environments
if (config.NODE_ENV !== 'development') {
  logger.add(
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
    })
  );
  logger.add(
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 10 * 1024 * 1024,
      maxFiles: 10,
    })
  );
}

/**
 * Create a child logger with additional context.
 */
export function createModuleLogger(moduleName: string) {
  return logger.child({ module: moduleName });
}
