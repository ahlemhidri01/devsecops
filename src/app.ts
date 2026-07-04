// ==============================================================
// SecureBank — Express Application Setup
// Configuration of middleware, routes, and global error handling
// ==============================================================

import express, { Application } from 'express';
import cors from 'cors';
import compression from 'compression';
import { config } from './shared/config';
import { logger } from './shared/logging';
import {
  securityHeaders,
  apiRateLimiter,
  errorHandler,
  notFoundHandler,
} from './shared/middleware';

import { authRoutes } from './modules/auth/auth.routes';
import { accountRoutes } from './modules/accounts/accounts.routes';
import { transactionRoutes } from './modules/transactions/transactions.routes';
import { beneficiaryRoutes } from './modules/beneficiaries/beneficiaries.routes';
import { cardRoutes } from './modules/cards/cards.routes';
import { notificationRoutes } from './modules/notifications/notifications.routes';
import { complianceRoutes } from './modules/compliance/compliance.routes';
// ...

export function createApp(): Application {
  const app = express();

  // ──────────────────────────────────────
  // 1. SECURITY & UTILITY MIDDLEWARE
  // ──────────────────────────────────────
  
  app.use(securityHeaders);
  app.use(cors({
    origin: config.NODE_ENV === 'production' ? 'https://app.securebank.com' : '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  }));
  app.use(compression());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  
  // ──────────────────────────────────────
  // 2. GLOBAL RATE LIMITING
  // ──────────────────────────────────────
  
  app.use(apiRateLimiter);

  // ──────────────────────────────────────
  // 3. LOGGING REQUESTS (EXCEPT HEALTH)
  // ──────────────────────────────────────
  
  app.use((req, res, next) => {
    if (req.path !== '/health') {
      logger.info('Incoming request', {
        method: req.method,
        path: req.path,
        ip: req.ip,
      });
    }
    next();
  });

  // ──────────────────────────────────────
  // 4. HEALTH CHECK & ROOT ROUTE
  // ──────────────────────────────────────
  
  app.get('/', (req, res) => {
    res.status(200).json({
      name: 'SecureBank Platform API',
      version: '1.0.0',
      status: 'online',
      prefix: config.API_PREFIX
    });
  });
  
  app.get('/health', async (req, res) => {
    // Basic health check for Kubernetes probes
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // ──────────────────────────────────────
  // 5. API ROUTES
  // ──────────────────────────────────────
  
  const apiRouter = express.Router();
  
  // Mount module routes here
  apiRouter.use('/auth', authRoutes);
  apiRouter.use('/accounts', accountRoutes);
  apiRouter.use('/transactions', transactionRoutes);
  apiRouter.use('/beneficiaries', beneficiaryRoutes);
  apiRouter.use('/cards', cardRoutes);
  apiRouter.use('/notifications', notificationRoutes);
  apiRouter.use('/compliance', complianceRoutes);
  
  app.use(config.API_PREFIX, apiRouter);

  // ──────────────────────────────────────
  // 6. ERROR HANDLING
  // ──────────────────────────────────────
  
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
