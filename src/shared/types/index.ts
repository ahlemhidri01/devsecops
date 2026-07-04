// ==============================================================
// SecureBank — Shared TypeScript Types & Enums
// ==============================================================

import { Request } from 'express';
import { UserRole } from '@prisma/client';

/**
 * Authenticated request — extends Express Request with user payload.
 */
export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email: string;
    role: UserRole;
  };
}

/**
 * Standard API response envelope.
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    timestamp: string;
  };
}

/**
 * Pagination query parameters.
 */
export interface PaginationParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Audit log entry for Kafka events.
 */
export interface AuditEvent {
  action: string;
  userId?: string;
  entity: string;
  entityId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
}

/**
 * Kafka event message structure.
 */
export interface KafkaEvent<T = unknown> {
  eventId: string;
  eventType: string;
  timestamp: string;
  source: string;
  payload: T;
}

/**
 * Transaction event payload for Kafka.
 */
export interface TransactionEvent {
  transactionId: string;
  type: string;
  status: string;
  amount: number;
  currency: string;
  senderAccountId?: string;
  receiverAccountId?: string;
  fraudScore?: number;
}

/**
 * Notification event payload for Kafka.
 */
export interface NotificationEvent {
  userId: string;
  type: string;
  channel: string;
  title: string;
  body: string;
  reference?: string;
}

/**
 * Health check response.
 */
export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime: number;
  timestamp: string;
  services: {
    database: 'up' | 'down';
    redis: 'up' | 'down';
    kafka: 'up' | 'down';
  };
}
