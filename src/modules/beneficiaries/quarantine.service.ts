// ==============================================================
// SecureBank — Beneficiary Quarantine Service
// Enforces 72h cooling period on new beneficiaries
// ==============================================================

import { config } from '../../shared/config';

export class QuarantineService {
  /**
   * Calculates the end date of the quarantine period for a new beneficiary.
   */
  static calculateQuarantineEnd(): Date {
    const quarantineHours = config.BENEFICIARY_QUARANTINE_HOURS;
    const end = new Date();
    end.setHours(end.getHours() + quarantineHours);
    return end;
  }

  /**
   * Checks if a given date is still in quarantine.
   */
  static isStillInQuarantine(quarantineUntil: Date | null): boolean {
    if (!quarantineUntil) return false;
    return new Date() < quarantineUntil;
  }
}
