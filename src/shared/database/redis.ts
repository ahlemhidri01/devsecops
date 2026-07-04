// ==============================================================
// SecureBank — Redis Client (Sessions, Rate Limiting, Blacklist)
// ==============================================================

import Redis from 'ioredis';
import { config } from '../config';
import { logger } from '../logging';

/**
 * Redis client for JWT blacklisting, session management,
 * and rate limiting counters.
 */
export const redis = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy: (times: number) => {
    if (times > 5) {
      logger.error('Redis connection failed after 5 retries');
      return null; // Stop retrying
    }
    return Math.min(times * 200, 2000);
  },
  lazyConnect: true,
});

redis.on('connect', () => {
  logger.info('Redis connected');
});

redis.on('error', (err) => {
  logger.error('Redis connection error', { error: err.message });
});

/**
 * Blacklist a JWT token (e.g., on logout).
 * TTL should match the token's remaining lifetime.
 */
export async function blacklistToken(token: string, ttlSeconds: number): Promise<void> {
  await redis.setex(`bl:${token}`, ttlSeconds, '1');
}

/**
 * Check if a JWT token is blacklisted.
 */
export async function isTokenBlacklisted(token: string): Promise<boolean> {
  const result = await redis.get(`bl:${token}`);
  return result !== null;
}

/**
 * Store a refresh token with its metadata.
 */
export async function storeRefreshToken(
  userId: string,
  tokenId: string,
  ttlSeconds: number
): Promise<void> {
  await redis.setex(`rt:${userId}:${tokenId}`, ttlSeconds, '1');
}

/**
 * Revoke all refresh tokens for a user (logout from all devices).
 */
export async function revokeAllUserTokens(userId: string): Promise<void> {
  const keys = await redis.keys(`rt:${userId}:*`);
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}

/**
 * Check Redis health.
 */
export async function checkRedisHealth(): Promise<boolean> {
  try {
    const pong = await redis.ping();
    return pong === 'PONG';
  } catch {
    logger.error('Redis health check failed');
    return false;
  }
}

/**
 * Graceful shutdown.
 */
export async function disconnectRedis(): Promise<void> {
  await redis.quit();
  logger.info('Redis connection closed');
}
