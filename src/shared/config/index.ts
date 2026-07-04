// ==============================================================
// SecureBank — Environment Configuration Loader
// Validates all environment variables at startup using Zod
// ==============================================================

import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

// Load .env file
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const envSchema = z.object({
  // Application
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  API_PREFIX: z.string().default('/api/v1'),

  // Database
  DATABASE_URL: z.string().url().startsWith('postgresql://'),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // JWT
  JWT_PRIVATE_KEY_PATH: z.string().default('./keys/private.pem'),
  JWT_PUBLIC_KEY_PATH: z.string().default('./keys/public.pem'),
  JWT_ACCESS_EXPIRATION: z.string().default('15m'),
  JWT_REFRESH_EXPIRATION: z.string().default('7d'),
  JWT_ISSUER: z.string().default('securebank-platform'),

  // Encryption
  ENCRYPTION_KEY: z.string().min(32),
  ENCRYPTION_IV_LENGTH: z.coerce.number().default(16),

  // Bcrypt
  BCRYPT_SALT_ROUNDS: z.coerce.number().min(12).default(12),

  // Rate Limiting
  AUTH_RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().default(5),

  // MFA
  MFA_ISSUER: z.string().default('SecureBank'),
  MFA_ALGORITHM: z.string().default('sha1'),
  MFA_DIGITS: z.coerce.number().default(6),
  MFA_PERIOD: z.coerce.number().default(30),

  // Kafka
  KAFKA_BROKERS: z.string().default('localhost:9092'),
  KAFKA_CLIENT_ID: z.string().default('securebank-api'),
  KAFKA_GROUP_ID: z.string().default('securebank-consumers'),

  // Account Lockout
  MAX_LOGIN_ATTEMPTS: z.coerce.number().default(3),
  LOCKOUT_DURATION_MINUTES: z.coerce.number().default(30),

  // Transaction Limits
  TRANSFER_MFA_THRESHOLD: z.coerce.number().default(1000),
  DAILY_TRANSFER_LIMIT_SEPA: z.coerce.number().default(10000),
  MONTHLY_TRANSFER_LIMIT_SEPA: z.coerce.number().default(50000),
  DAILY_TRANSFER_LIMIT_SWIFT: z.coerce.number().default(25000),

  // Beneficiary
  BENEFICIARY_QUARANTINE_HOURS: z.coerce.number().default(72),
  MAX_BENEFICIARIES_PER_CLIENT: z.coerce.number().default(20),

  // Fraud Detection
  FRAUD_SCORE_THRESHOLD: z.coerce.number().default(0.75),

  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  LOG_FORMAT: z.enum(['json', 'simple']).default('json'),
});

export type EnvConfig = z.infer<typeof envSchema>;

let config: EnvConfig;

try {
  config = envSchema.parse(process.env);
} catch (error) {
  if (error instanceof z.ZodError) {
    const missingVars = error.errors
      .map((e) => `  ❌ ${e.path.join('.')}: ${e.message}`)
      .join('\n');
    console.error(`\n🔒 SecureBank — Configuration validation failed:\n${missingVars}\n`);
    console.error('💡 Copy .env.example to .env and fill in the required values.\n');
    process.exit(1);
  }
  throw error;
}

export { config };
