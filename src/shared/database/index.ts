// ==============================================================
// SecureBank — Prisma Database Client (Singleton)
// ==============================================================

import { PrismaClient } from '@prisma/client';
import { logger } from '../logging';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

/**
 * Singleton Prisma client instance.
 * Prevents multiple connections in development (hot-reload).
 */
export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: [
      { level: 'query', emit: 'event' },
      { level: 'error', emit: 'stdout' },
      { level: 'warn', emit: 'stdout' },
    ],
  });

// Log slow queries in development
if (process.env.NODE_ENV === 'development') {
  prisma.$on('query' as never, (e: { query: string; duration: number }) => {
    if (e.duration > 500) {
      logger.warn('Slow query detected', {
        query: e.query.slice(0, 200), // Truncate for safety
        duration: `${e.duration}ms`,
      });
    }
  });
}

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

/**
 * Graceful shutdown — close database connection.
 */
export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
  logger.info('Database connection closed');
}

/**
 * Health check — verify database connectivity.
 */
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    logger.error('Database health check failed');
    return false;
  }
}
