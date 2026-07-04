// ==============================================================
// SecureBank — Compliance Routes
// ==============================================================

import { Router } from 'express';
import { ComplianceController } from './compliance.controller';
import { authGuard, sensitiveRateLimiter } from '../../shared/middleware';

const router = Router();

router.use(authGuard());

// GDPR endpoints
router.get('/export-audit', sensitiveRateLimiter, ComplianceController.exportAuditTrail);
router.post('/delete-account', sensitiveRateLimiter, ComplianceController.rightToBeForgotten);

// DORA / Admin endpoints
router.get('/dora-report', ComplianceController.getDoraReport);

export { router as complianceRoutes };
