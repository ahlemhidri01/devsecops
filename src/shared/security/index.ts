// ==============================================================
// SecureBank — Security Utilities
// AES-256 encryption, bcrypt hashing, JWT RS256, IBAN validation
// ==============================================================

import crypto from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { config } from '../config';

// ──────────────────────────────────────
// AES-256 ENCRYPTION / DECRYPTION
// ──────────────────────────────────────

const ALGORITHM = 'aes-256-cbc';

/**
 * Encrypt sensitive data using AES-256-CBC.
 * Used for: IBAN, account numbers, balances at rest.
 */
export function encrypt(text: string): string {
  const iv = crypto.randomBytes(config.ENCRYPTION_IV_LENGTH);
  const key = Buffer.from(config.ENCRYPTION_KEY, 'hex');
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt AES-256-CBC encrypted data.
 */
export function decrypt(encryptedText: string): string {
  const [ivHex, encrypted] = encryptedText.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const key = Buffer.from(config.ENCRYPTION_KEY, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// ──────────────────────────────────────
// BCRYPT PASSWORD HASHING
// ──────────────────────────────────────

/**
 * Hash a password with bcrypt (salt factor from config, minimum 12).
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, config.BCRYPT_SALT_ROUNDS);
}

/**
 * Compare a plain password with a bcrypt hash.
 */
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ──────────────────────────────────────
// JWT RS256 (ASYMMETRIC)
// ──────────────────────────────────────

let privateKey: string | null = null;
let publicKey: string | null = null;

function getPrivateKey(): string {
  if (!privateKey) {
    const keyPath = path.resolve(process.cwd(), config.JWT_PRIVATE_KEY_PATH);
    privateKey = fs.readFileSync(keyPath, 'utf8');
  }
  return privateKey;
}

function getPublicKey(): string {
  if (!publicKey) {
    const keyPath = path.resolve(process.cwd(), config.JWT_PUBLIC_KEY_PATH);
    publicKey = fs.readFileSync(keyPath, 'utf8');
  }
  return publicKey;
}

export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
  type: 'access' | 'refresh';
}

/**
 * Sign a JWT access token with RS256 (private key).
 * Expiration: 15 minutes by default.
 */
export function signAccessToken(payload: Omit<JwtPayload, 'type'>): string {
  return jwt.sign(
    { ...payload, type: 'access' },
    getPrivateKey(),
    {
      algorithm: 'RS256',
      expiresIn: config.JWT_ACCESS_EXPIRATION,
      issuer: config.JWT_ISSUER,
    }
  );
}

/**
 * Sign a JWT refresh token with RS256 (private key).
 * Expiration: 7 days by default.
 */
export function signRefreshToken(payload: Omit<JwtPayload, 'type'>): string {
  return jwt.sign(
    { ...payload, type: 'refresh' },
    getPrivateKey(),
    {
      algorithm: 'RS256',
      expiresIn: config.JWT_REFRESH_EXPIRATION,
      issuer: config.JWT_ISSUER,
    }
  );
}

/**
 * Verify and decode a JWT token using the public key.
 */
export function verifyToken(token: string): JwtPayload & jwt.JwtPayload {
  return jwt.verify(token, getPublicKey(), {
    algorithms: ['RS256'],
    issuer: config.JWT_ISSUER,
  }) as JwtPayload & jwt.JwtPayload;
}

// ──────────────────────────────────────
// IBAN VALIDATION & GENERATION
// ──────────────────────────────────────

/**
 * Validate an IBAN using the modulo 97 algorithm (ISO 13616).
 */
export function validateIBAN(iban: string): boolean {
  const cleaned = iban.replace(/\s/g, '').toUpperCase();

  // Check format: 2 letters + 2 digits + up to 30 alphanumeric
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{1,30}$/.test(cleaned)) {
    return false;
  }

  // Move first 4 characters to end
  const rearranged = cleaned.slice(4) + cleaned.slice(0, 4);

  // Convert letters to numbers (A=10, B=11, ..., Z=35)
  const numeric = rearranged
    .split('')
    .map((char) => {
      const code = char.charCodeAt(0);
      return code >= 65 ? (code - 55).toString() : char;
    })
    .join('');

  // Modulo 97 check (handle large numbers by processing in chunks)
  let remainder = '';
  for (const digit of numeric) {
    remainder += digit;
    if (remainder.length > 7) {
      remainder = (parseInt(remainder, 10) % 97).toString();
    }
  }

  return parseInt(remainder, 10) % 97 === 1;
}

/**
 * Generate a valid French IBAN.
 * Format: FR + 2 check digits + 10-digit bank code + 11-digit account number + 2-digit checksum
 */
export function generateIBAN(): string {
  // Bank code (5 digits) + Branch code (5 digits)
  const bankCode = '30001'; // SecureBank code
  const branchCode = '00794';

  // Account number (11 characters) + RIB key (2 digits)
  const accountNumber = generateRandomDigits(11);
  const ribKey = calculateRIBKey(bankCode, branchCode, accountNumber);

  // BBAN = bank code + branch code + account number + RIB key
  const bban = `${bankCode}${branchCode}${accountNumber}${ribKey}`;

  // Calculate IBAN check digits
  const checkDigits = calculateIBANCheckDigits('FR', bban);

  return `FR${checkDigits}${bban}`;
}

function generateRandomDigits(length: number): string {
  let result = '';
  for (let i = 0; i < length; i++) {
    result += Math.floor(Math.random() * 10).toString();
  }
  return result;
}

function calculateRIBKey(bankCode: string, branchCode: string, accountNumber: string): string {
  // Convert letters in account number to digits for RIB calculation
  const numericAccount = accountNumber.split('').map((c) => {
    const code = c.charCodeAt(0);
    if (code >= 65 && code <= 73) return (code - 64).toString(); // A-I → 1-9
    if (code >= 74 && code <= 82) return (code - 73).toString(); // J-R → 1-9
    if (code >= 83 && code <= 90) return (code - 82).toString(); // S-Z → 1-8
    return c;
  }).join('');

  const combined = bankCode + branchCode + numericAccount;
  const remainder = BigInt(combined) % 97n;
  const key = 97n - remainder;
  return key.toString().padStart(2, '0');
}

function calculateIBANCheckDigits(countryCode: string, bban: string): string {
  // Append country code + '00' and convert to numeric
  const rearranged = bban + countryCode.split('').map((c) => (c.charCodeAt(0) - 55).toString()).join('') + '00';

  let remainder = '';
  for (const digit of rearranged) {
    remainder += digit;
    if (remainder.length > 7) {
      remainder = (parseInt(remainder, 10) % 97).toString();
    }
  }

  const checkDigits = 98 - (parseInt(remainder, 10) % 97);
  return checkDigits.toString().padStart(2, '0');
}

// ──────────────────────────────────────
// TRANSACTION SIGNATURE (NON-REPUDIATION)
// ──────────────────────────────────────

/**
 * Sign transaction data for non-repudiation.
 */
export function signTransaction(transactionData: string): string {
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(transactionData);
  return sign.sign(getPrivateKey(), 'hex');
}

/**
 * Verify a transaction signature.
 */
export function verifyTransactionSignature(transactionData: string, signature: string): boolean {
  const verify = crypto.createVerify('RSA-SHA256');
  verify.update(transactionData);
  return verify.verify(getPublicKey(), signature, 'hex');
}

// ──────────────────────────────────────
// PII MASKING
// ──────────────────────────────────────

/**
 * Mask an IBAN for logging purposes.
 * Example: FR7630001007940000000001234 → FR76****1234
 */
export function maskIBAN(iban: string): string {
  if (!iban || iban.length < 8) return '****';
  return `${iban.slice(0, 4)}****${iban.slice(-4)}`;
}

/**
 * Mask a PAN (card number) for logging purposes.
 * Example: 4111111111111111 → ****1111
 */
export function maskPAN(pan: string): string {
  if (!pan || pan.length < 4) return '****';
  return `****${pan.slice(-4)}`;
}

/**
 * Mask email for logging purposes.
 * Example: john.doe@example.com → j***e@example.com
 */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***@***';
  if (local.length <= 2) return `${local[0]}***@${domain}`;
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}
