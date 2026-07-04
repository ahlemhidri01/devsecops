// ==============================================================
// SecureBank — Fraud Detection Service
// Real-time transaction scoring based on amount, frequency, location
// ==============================================================

import { config } from '../../shared/config';
import { prisma } from '../../shared/database';

export class FraudService {
  /**
   * Calculates a fraud score between 0.00 and 1.00.
   * Real implementation would use an ML model or complex rules engine.
   * This is a simulated rules-based scoring.
   */
  static async calculateScore(
    userId: string,
    amount: number,
    ipAddress?: string,
    device?: string,
    isInternational?: boolean
  ): Promise<number> {
    let score = 0;

    // Rule 1: High amount spike
    // Compare against average transaction amount for this user in last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const history = await prisma.transaction.aggregate({
      where: {
        senderAccount: { userId },
        createdAt: { gte: thirtyDaysAgo },
        status: 'COMPLETED',
      },
      _avg: { amount: true },
      _count: { id: true },
    });

    const avgAmount = history._avg.amount ? Number(history._avg.amount) : 0;
    const txCount = history._count.id;

    if (txCount > 5 && avgAmount > 0) {
      if (amount > avgAmount * 10) score += 0.3; // 10x average
      else if (amount > avgAmount * 5) score += 0.15; // 5x average
    }

    // Rule 2: High velocity (many transactions in short time)
    const oneHourAgo = new Date();
    oneHourAgo.setHours(oneHourAgo.getHours() - 1);

    const recentTxCount = await prisma.transaction.count({
      where: {
        senderAccount: { userId },
        createdAt: { gte: oneHourAgo },
      },
    });

    if (recentTxCount > 10) score += 0.2;
    if (recentTxCount > 20) score += 0.4;

    // Rule 3: International transfer risk
    if (isInternational) {
      score += 0.1;
      if (amount > 5000) score += 0.2;
    }

    // Rule 4: New device or IP (simulated - would check login history usually)
    // score += 0.2 if IP is known bad or device is completely new

    // Cap score at 1.00
    return Math.min(score, 1.0);
  }

  /**
   * Checks if a score exceeds the threshold to block the transaction.
   */
  static isFraudulent(score: number): boolean {
    return score >= config.FRAUD_SCORE_THRESHOLD;
  }
}
