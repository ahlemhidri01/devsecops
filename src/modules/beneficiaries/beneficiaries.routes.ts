// ==============================================================
// SecureBank — Beneficiaries Routes
// ==============================================================

import { Router } from 'express';
import { BeneficiariesController } from './beneficiaries.controller';
import { validate, enforceMfaSetup } from '../auth/auth.middleware'; 
import { authGuard, sensitiveRateLimiter } from '../../shared/middleware';
import { addBeneficiarySchema, updateBeneficiarySchema } from './beneficiaries.validators';

const router = Router();

router.use(authGuard());

// Adding a beneficiary requires MFA setup and strict rate limiting
router.post(
  '/',
  enforceMfaSetup,
  sensitiveRateLimiter,
  validate(addBeneficiarySchema),
  BeneficiariesController.addBeneficiary
);

router.get(
  '/',
  BeneficiariesController.listBeneficiaries
);

router.patch(
  '/:id',
  validate(updateBeneficiarySchema),
  BeneficiariesController.updateBeneficiary
);

router.delete(
  '/:id',
  BeneficiariesController.deleteBeneficiary
);

export { router as beneficiaryRoutes };
