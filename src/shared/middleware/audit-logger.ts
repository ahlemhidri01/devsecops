// ==============================================================
// SecureBank — Audit Logger Middleware
// Append-only audit trail for every authenticated action
// ==============================================================

import { Response, NextFunction } from 'express';
import { AuditAction } from '@prisma/client';
import { prisma } from '../database';
import { createModuleLogger } from '../logging';
import { AuthenticatedRequest } from '../types';
import { publishEvent, KAFKA_TOPICS } from '../kafka';

const logger = createModuleLogger('audit');

/**
 * Log an audit event to the database (append-only) and publish to Kafka.
 */
export async function logAuditEvent(
  action: AuditAction,
  entity: string,
  entityId: string | null,
  userId: string | null,
  details: Record<string, unknown> | null,
  ipAddress: string | null,
  userAgent: string | null
): Promise<void> {
  try {
    // Write to append-only audit table
    await prisma.auditLog.create({
      data: {
        action,
        entity,
        entityId,
        userId,
        details: details ? JSON.parse(JSON.stringify(details)) : null,
        ipAddress,
        userAgent,
      },
    });

    // Publish audit event to Kafka for downstream consumers
    await publishEvent(KAFKA_TOPICS.AUDIT_EVENTS, action, {
      action,
      entity,
      entityId,
      userId,
      details,
      ipAddress,
      timestamp: new Date().toISOString(),
    });

    logger.debug('Audit event recorded', { action, entity, entityId, userId });
  } catch (error) {
    // Audit logging failure should never crash the application
    // but must be logged as a critical error
    logger.error('Failed to record audit event', {
      action,
      entity,
      entityId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Middleware that automatically logs API requests to the audit trail.
 * Applied to routes that require audit tracking.
 */
export function auditMiddleware(action: AuditAction, entity: string) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    // Store original end function
    const originalEnd = res.end;

    // Override res.end to capture response status
    res.end = function (this: Response, ...args: Parameters<typeof originalEnd>) {
      const statusCode = res.statusCode;
      const success = statusCode >= 200 && statusCode < 300;

      // Log audit event after response is sent
      setImmediate(() => {
        logAuditEvent(
          action,
          entity,
          req.params.id || req.body?.id || null,
          req.user?.userId || null,
          {
            method: req.method,
            path: req.path,
            statusCode,
            success,
          },
          req.ip || null,
          req.headers['user-agent'] || null
        ).catch(() => {
          // Swallow audit logging errors — already logged internally
        });
      });

      return originalEnd.apply(this, args);
    } as typeof originalEnd;

    next();
  };
}
