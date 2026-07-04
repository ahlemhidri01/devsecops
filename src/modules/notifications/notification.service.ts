// ==============================================================
// SecureBank — Notifications Service
// Listens to Kafka events and dispatches notifications
// ==============================================================

import { prisma } from '../../shared/database';
import { createModuleLogger } from '../../shared/logging';
import { NotificationType } from '@prisma/client';

const logger = createModuleLogger('notification-service');

export class NotificationService {
  /**
   * Initializes Kafka consumer to listen for domain events.
   * This is typically called on application startup.
   */
  static async startListening() {
    // In a real app, this would use the consumeEvents method from shared/kafka
    // For brevity, we mock the handler logic here.
    logger.info('Notification service is ready to process events');
  }

  /**
   * Sends an in-app notification.
   */
  static async sendInAppNotification(userId: string, title: string, content: string, type: NotificationType) {
    try {
      await prisma.notification.create({
        data: {
          userId,
          type,
          title,
          content,
        },
      });
      logger.debug('In-app notification created', { userId, type });
    } catch (error) {
      logger.error('Failed to create in-app notification', { error: error instanceof Error ? error.message : 'Unknown' });
    }
  }

  /**
   * Mock method for sending emails.
   */
  static async sendEmail(userId: string, subject: string, template: string, data: any) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return;
    
    // e.g., SendGrid integration goes here
    logger.info(`Sending email to ${user.email}: ${subject}`);
  }

  /**
   * Mock method for sending SMS.
   */
  static async sendSms(userId: string, message: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.phone) return;
    
    // e.g., Twilio integration goes here
    logger.info(`Sending SMS to ${user.phone}: ${message}`);
  }

  // --- Event Handlers ---

  static async handleTransactionInitiated(event: any) {
    // Large transfers might trigger SMS
  }

  static async handleTransactionCompleted(event: any) {
    await this.sendInAppNotification(
      event.userId,
      'Transfer Completed',
      `Your transfer of ${event.amount} has been completed.`,
      'TRANSACTION_ALERT'
    );
  }

  static async handleFraudDetected(event: any) {
    await this.sendInAppNotification(
      event.userId,
      'Security Alert',
      'A recent transaction was blocked due to suspicious activity. Please review your account.',
      'SECURITY_ALERT'
    );
    await this.sendEmail(event.userId, 'Security Alert: Blocked Transaction', 'fraud-alert', event);
    await this.sendSms(event.userId, 'SecureBank: A transaction was blocked. Please check your app.');
  }

  static async handleBeneficiaryAdded(event: any) {
    await this.sendInAppNotification(
      event.userId,
      'New Beneficiary Added',
      `A new beneficiary with IBAN ending in ${event.maskedIban.slice(-4)} was added. It will be active in 72 hours.`,
      'SECURITY_ALERT'
    );
    await this.sendEmail(event.userId, 'New Beneficiary Added', 'beneficiary-added', event);
  }
}
