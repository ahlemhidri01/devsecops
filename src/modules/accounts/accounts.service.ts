// ==============================================================
// SecureBank — Accounts Service
// Core business logic for bank accounts
// ==============================================================

import { AccountType, AccountStatus, Prisma } from '@prisma/client';
import { prisma } from '../../shared/database';
import { IbanService } from './iban.service';
import { StatementService } from './statement.service';
import { AppError } from '../../shared/middleware';
import { decrypt, maskIBAN } from '../../shared/security';
import { logAuditEvent } from '../../shared/middleware';

export class AccountsService {
  /**
   * Creates a new bank account for a user.
   * Limits a user to a maximum of 5 active accounts.
   */
  static async createAccount(userId: string, type: AccountType, currency: string, label?: string) {
    // Check max accounts limit
    const activeAccounts = await prisma.account.count({
      where: {
        userId,
        status: AccountStatus.ACTIVE,
      },
    });

    if (activeAccounts >= 5) {
      throw new AppError('Maximum number of active accounts reached (5)', 403);
    }

    // Generate unique IBAN
    const encryptedIban = await IbanService.generateUniqueEncryptedIban();

    // Set default limits based on account type
    let dailyLimit = 10000;
    let monthlyLimit = 50000;

    if (type === AccountType.PROFESSIONNEL) {
      dailyLimit = 50000;
      monthlyLimit = 200000;
    }

    // Create account within a transaction
    const account = await prisma.$transaction(async (tx) => {
      const newAccount = await tx.account.create({
        data: {
          userId,
          iban: encryptedIban,
          type,
          currency,
          label,
          dailyLimit,
          monthlyLimit,
        },
      });

      return newAccount;
    });

    await logAuditEvent('ACCOUNT_CREATED', 'Account', account.id, userId, { type, currency }, null, null);

    return this.formatAccountResponse(account);
  }

  /**
   * Retrieves an account by ID, checking ownership.
   */
  static async getAccount(accountId: string, userId: string, userRole: string) {
    const account = await prisma.account.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      throw new AppError('Account not found', 404);
    }

    // Enforce ownership unless admin/auditor
    if (userRole === 'CLIENT' && account.userId !== userId) {
      throw new AppError('Access denied', 403, 'AUTH_OWNERSHIP_VIOLATION');
    }

    await logAuditEvent('ACCOUNT_VIEWED', 'Account', accountId, userId, null, null, null);

    return this.formatAccountResponse(account);
  }

  /**
   * Lists all accounts for a user.
   */
  static async listAccounts(userId: string) {
    const accounts = await prisma.account.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });

    return accounts.map(a => this.formatAccountResponse(a));
  }

  /**
   * Updates account limits.
   */
  static async updateLimits(accountId: string, userId: string, userRole: string, limits: { dailyLimit?: number, monthlyLimit?: number }) {
    const account = await prisma.account.findUnique({ where: { id: accountId } });
    
    if (!account) throw new AppError('Account not found', 404);
    if (userRole === 'CLIENT' && account.userId !== userId) throw new AppError('Access denied', 403);
    if (account.status !== AccountStatus.ACTIVE) throw new AppError('Account is not active', 403);

    const updatedAccount = await prisma.account.update({
      where: { id: accountId },
      data: limits,
    });

    return this.formatAccountResponse(updatedAccount);
  }

  /**
   * Closes an account. Requires balance to be zero.
   */
  static async closeAccount(accountId: string, userId: string, userRole: string) {
    const account = await prisma.account.findUnique({ where: { id: accountId } });
    
    if (!account) throw new AppError('Account not found', 404);
    if (userRole === 'CLIENT' && account.userId !== userId) throw new AppError('Access denied', 403);
    if (account.status === AccountStatus.CLOSED) throw new AppError('Account is already closed', 400);

    // Ensure balance is 0
    if (Number(account.balance) !== 0) {
      throw new AppError('Account balance must be zero before closing', 400);
    }

    const updatedAccount = await prisma.account.update({
      where: { id: accountId },
      data: {
        status: AccountStatus.CLOSED,
        closedAt: new Date(),
      },
    });

    await logAuditEvent('ACCOUNT_CLOSED', 'Account', accountId, userId, null, null, null);

    return this.formatAccountResponse(updatedAccount);
  }

  /**
   * Generates a statement.
   */
  static async generateStatement(accountId: string, userId: string, userRole: string, startDate?: Date, endDate?: Date, format: 'PDF' | 'JSON' = 'PDF') {
    const account = await prisma.account.findUnique({ where: { id: accountId } });
    
    if (!account) throw new AppError('Account not found', 404);
    if (userRole === 'CLIENT' && account.userId !== userId) throw new AppError('Access denied', 403);

    // Default to last 30 days if not provided
    const end = endDate || new Date();
    const start = startDate || new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

    const statement = await StatementService.generateStatement(accountId, start, end, format);
    
    await logAuditEvent('STATEMENT_GENERATED', 'Account', accountId, userId, { format, start, end }, null, null);
    
    return statement;
  }

  /**
   * Formats account for API response (decrypts IBAN, returns masked version).
   */
  private static formatAccountResponse(account: any) {
    const decryptedIban = decrypt(account.iban);
    
    return {
      id: account.id,
      userId: account.userId,
      iban: decryptedIban, // Full IBAN returned to authenticated owner
      maskedIban: maskIBAN(decryptedIban),
      bic: account.bic,
      type: account.type,
      status: account.status,
      balance: Number(account.balance), // Needs to be decrypted in a real implementation if encrypted at rest
      currency: account.currency,
      label: account.label,
      dailyLimit: Number(account.dailyLimit),
      monthlyLimit: Number(account.monthlyLimit),
      createdAt: account.createdAt,
    };
  }
}
