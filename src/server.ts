// ==============================================================
// SecureBank — Server Entry Point
// Bootstraps DB, Redis, Kafka, and starts the Express server
// ==============================================================

import { createApp } from './app';
import { config } from './shared/config';
import { logger } from './shared/logging';
import { checkDatabaseHealth, disconnectDatabase } from './shared/database';
import { checkRedisHealth, disconnectRedis } from './shared/database/redis';
import { checkKafkaHealth, disconnectKafka } from './shared/kafka';
import http from 'http';

async function bootstrap() {
  logger.info('Starting SecureBank API...', { env: config.NODE_ENV });

  // 1. Verify infrastructure health before starting server
  const dbHealthy = await checkDatabaseHealth();
  const redisHealthy = await checkRedisHealth();
  const kafkaHealthy = await checkKafkaHealth();

  if (!dbHealthy || !redisHealthy) {
    logger.error('Critical infrastructure check failed. Aborting startup.');
    process.exit(1);
  }

  if (!kafkaHealthy) {
    logger.warn('Kafka is unavailable. Event streaming will not work.');
    // In production, we might want to exit here if Kafka is mandatory
  }

  // 2. Initialize Express application
  const app = createApp();
  const server = http.createServer(app);

  // 3. Start server
  server.listen(config.PORT, () => {
    logger.info(`SecureBank API running on port ${config.PORT}`, {
      prefix: config.API_PREFIX,
      url: `http://localhost:${config.PORT}${config.API_PREFIX}`,
    });
  });

  // 4. Graceful shutdown handler
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}. Starting graceful shutdown...`);
    
    server.close(async () => {
      logger.info('HTTP server closed');
      
      try {
        await Promise.all([
          disconnectDatabase(),
          disconnectRedis(),
          disconnectKafka()
        ]);
        logger.info('Graceful shutdown completed successfully');
        process.exit(0);
      } catch (error) {
        logger.error('Error during graceful shutdown', { 
          error: error instanceof Error ? error.message : 'Unknown' 
        });
        process.exit(1);
      }
    });

    // Force shutdown after 10s if graceful fails
    setTimeout(() => {
      logger.error('Graceful shutdown timeout. Forcing exit.');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

// Global unhandled error handlers
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
  // In production, we typically want to exit on uncaught exceptions
  // process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection', { reason });
});

bootstrap().catch((error) => {
  logger.error('Failed to start server', { error: error.message, stack: error.stack });
  process.exit(1);
});
