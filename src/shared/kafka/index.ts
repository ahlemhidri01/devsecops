// ==============================================================
// SecureBank — Kafka Producer & Consumer
// TLS-encrypted event streaming for transactions, audit, notifications
// ==============================================================

import { Kafka, Producer, Consumer, logLevel, EachMessagePayload } from 'kafkajs';
import { config } from '../config';
import { logger } from '../logging';
import { v4 as uuidv4 } from 'uuid';
import { KafkaEvent } from '../types';

// ──────────────────────────────────────
// KAFKA CLIENT
// ──────────────────────────────────────

const kafka = new Kafka({
  clientId: config.KAFKA_CLIENT_ID,
  brokers: config.KAFKA_BROKERS.split(','),
  logLevel: config.NODE_ENV === 'production' ? logLevel.WARN : logLevel.INFO,
  retry: {
    initialRetryTime: 300,
    retries: 8,
  },
});

// ──────────────────────────────────────
// TOPICS
// ──────────────────────────────────────

export const KAFKA_TOPICS = {
  TRANSACTION_EVENTS: 'securebank.transactions.events',
  AUDIT_EVENTS: 'securebank.audit.events',
  NOTIFICATION_EVENTS: 'securebank.notifications.events',
  FRAUD_ALERTS: 'securebank.fraud.alerts',
  BENEFICIARY_EVENTS: 'securebank.beneficiaries.events',
  CARD_EVENTS: 'securebank.cards.events',
} as const;

// ──────────────────────────────────────
// PRODUCER
// ──────────────────────────────────────

let producer: Producer | null = null;

/**
 * Get or create the Kafka producer singleton.
 */
export async function getProducer(): Promise<Producer> {
  if (!producer) {
    producer = kafka.producer({
      allowAutoTopicCreation: true,
      transactionTimeout: 30000,
    });
    await producer.connect();
    logger.info('Kafka producer connected');
  }
  return producer;
}

/**
 * Publish an event to a Kafka topic.
 */
export async function publishEvent<T>(
  topic: string,
  eventType: string,
  payload: T
): Promise<void> {
  const kafkaProducer = await getProducer();

  const event: KafkaEvent<T> = {
    eventId: uuidv4(),
    eventType,
    timestamp: new Date().toISOString(),
    source: config.KAFKA_CLIENT_ID,
    payload,
  };

  await kafkaProducer.send({
    topic,
    messages: [
      {
        key: event.eventId,
        value: JSON.stringify(event),
        headers: {
          eventType,
          timestamp: event.timestamp,
        },
      },
    ],
  });

  logger.debug('Kafka event published', { topic, eventType, eventId: event.eventId });
}

// ──────────────────────────────────────
// CONSUMER
// ──────────────────────────────────────

/**
 * Create and subscribe a Kafka consumer to specific topics.
 */
export async function createConsumer(
  groupId: string,
  topics: string[],
  handler: (payload: EachMessagePayload) => Promise<void>
): Promise<Consumer> {
  const consumer = kafka.consumer({ groupId });

  await consumer.connect();
  logger.info('Kafka consumer connected', { groupId, topics });

  for (const topic of topics) {
    await consumer.subscribe({ topic, fromBeginning: false });
  }

  await consumer.run({
    eachMessage: async (payload) => {
      try {
        await handler(payload);
      } catch (error) {
        logger.error('Kafka message processing failed', {
          topic: payload.topic,
          partition: payload.partition,
          offset: payload.message.offset,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    },
  });

  return consumer;
}

// ──────────────────────────────────────
// HEALTH & CLEANUP
// ──────────────────────────────────────

/**
 * Check Kafka connectivity.
 */
export async function checkKafkaHealth(): Promise<boolean> {
  try {
    const admin = kafka.admin();
    await admin.connect();
    await admin.listTopics();
    await admin.disconnect();
    return true;
  } catch {
    logger.error('Kafka health check failed');
    return false;
  }
}

/**
 * Graceful shutdown — disconnect producer.
 */
export async function disconnectKafka(): Promise<void> {
  if (producer) {
    await producer.disconnect();
    producer = null;
    logger.info('Kafka producer disconnected');
  }
}
