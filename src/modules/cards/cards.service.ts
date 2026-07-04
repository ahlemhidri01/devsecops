// ==============================================================
// SecureBank — Cards Service
// ==============================================================

import { CardType, CardStatus } from '@prisma/client';
import { prisma } from '../../shared/database';
import { AppError } from '../../shared/middleware';
import { TokenizationService } from './tokenization.service';
import { hashPassword } from '../../shared/security';
import { logAuditEvent } from '../../shared/middleware';
import { publishEvent, KAFKA_TOPICS } from '../../shared/kafka';

export class CardsService {
  /**
   * Issues a new card for an account.
   */
  static async createCard(userId: string, accountId: string, type: CardType, isSingleUse: boolean = false) {
    // 1. Verify account
    const account = await prisma.account.findUnique({ where: { id: accountId } });
    if (!account) throw new AppError('Account not found', 404);
    if (account.userId !== userId) throw new AppError('Access denied', 403);

    // 2. Generate Card details
    const pan = TokenizationService.generatePan('VISA');
    const tokenizedPan = TokenizationService.tokenizePan(pan);
    const last4Digits = pan.slice(-4);
    
    const expiryMonth = new Date().getMonth() + 1;
    const expiryYear = new Date().getFullYear() + 3; // 3 years validity

    // 3. Save to DB
    const card = await prisma.card.create({
      data: {
        userId,
        accountId,
        type,
        tokenizedPan,
        last4Digits,
        expiryMonth,
        expiryYear,
        isSingleUse: type === 'VIRTUAL' ? isSingleUse : false,
        // Virtual cards are active immediately. Physical require PIN setup/activation.
        status: type === 'VIRTUAL' ? 'ACTIVE' : 'ACTIVE', // Simplifying for this demo
      },
    });

    await logAuditEvent('CARD_CREATED', 'Card', card.id, userId, { type, isSingleUse }, null, null);
    
    await publishEvent(KAFKA_TOPICS.CARD_EVENTS, 'CARD_ISSUED', { cardId: card.id, userId });

    return {
      id: card.id,
      accountId: card.accountId,
      type: card.type,
      status: card.status,
      last4Digits: card.last4Digits,
      expiryMonth: card.expiryMonth,
      expiryYear: card.expiryYear,
      // We return the full PAN and CVV ONLY once upon creation for virtual cards
      pan: type === 'VIRTUAL' ? pan : null,
      cvv: type === 'VIRTUAL' ? TokenizationService.generateCvv() : null,
    };
  }

  /**
   * Lists cards for a user.
   */
  static async listCards(userId: string) {
    const cards = await prisma.card.findMany({
      where: { userId },
      select: {
        id: true,
        accountId: true,
        type: true,
        status: true,
        last4Digits: true,
        expiryMonth: true,
        expiryYear: true,
        dailyLimit: true,
        monthlyLimit: true,
        contactlessEnabled: true,
        onlinePaymentEnabled: true,
        internationalEnabled: true,
        isSingleUse: true,
      }
    });

    return cards;
  }

  /**
   * Blocks a card immediately.
   */
  static async blockCard(cardId: string, userId: string) {
    const card = await prisma.card.findUnique({ where: { id: cardId } });
    if (!card) throw new AppError('Card not found', 404);
    if (card.userId !== userId) throw new AppError('Access denied', 403);

    const updated = await prisma.card.update({
      where: { id: cardId },
      data: {
        status: 'BLOCKED',
        blockedAt: new Date(),
      },
    });

    await logAuditEvent('CARD_BLOCKED', 'Card', cardId, userId, null, null, null);
    await publishEvent(KAFKA_TOPICS.CARD_EVENTS, 'CARD_BLOCKED', { cardId, userId });

    return { success: true, message: 'Card has been blocked successfully' };
  }

  /**
   * Updates card settings.
   */
  static async updateSettings(cardId: string, userId: string, data: any) {
    const card = await prisma.card.findUnique({ where: { id: cardId } });
    if (!card) throw new AppError('Card not found', 404);
    if (card.userId !== userId) throw new AppError('Access denied', 403);
    if (card.status !== 'ACTIVE') throw new AppError('Card is not active', 400);

    const updated = await prisma.card.update({
      where: { id: cardId },
      data,
      select: {
        id: true,
        dailyLimit: true,
        monthlyLimit: true,
        contactlessEnabled: true,
        onlinePaymentEnabled: true,
        internationalEnabled: true,
      }
    });

    await logAuditEvent('CARD_SETTINGS_CHANGED', 'Card', cardId, userId, data, null, null);

    return updated;
  }

  /**
   * Sets or changes PIN for physical cards.
   */
  static async setPin(cardId: string, userId: string, pin: string) {
    const card = await prisma.card.findUnique({ where: { id: cardId } });
    if (!card) throw new AppError('Card not found', 404);
    if (card.userId !== userId) throw new AppError('Access denied', 403);
    if (card.type === 'VIRTUAL') throw new AppError('Virtual cards do not have a PIN', 400);

    const hashedPin = await hashPassword(pin);

    await prisma.card.update({
      where: { id: cardId },
      data: { pinHash: hashedPin },
    });

    return { success: true, message: 'PIN set successfully' };
  }
}
