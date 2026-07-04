// ==============================================================
// SecureBank — Auth Service
// Core business logic: Registration, Login, Lockout
// ==============================================================

import { prisma } from '../../shared/database';
import { hashPassword, comparePassword } from '../../shared/security';
import { AppError } from '../../shared/middleware';
import { SessionService } from './session.service';
import { MfaService } from './mfa.service';
import { config } from '../../shared/config';
import { UserStatus } from '@prisma/client';
import { z } from 'zod';
import { registerSchema } from './auth.validators';

type RegisterDto = z.infer<typeof registerSchema>['body'];

export class AuthService {
  /**
   * Registers a new user.
   */
  static async register(data: RegisterDto) {
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existingUser) {
      throw new AppError('Email already in use', 409);
    }

    const hashedPassword = await hashPassword(data.password);

    const user = await prisma.user.create({
      data: {
        email: data.email,
        passwordHash: hashedPassword,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        status: UserStatus.PENDING_KYC,
      },
    });

    // Do not return password hash
    const { passwordHash, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  /**
   * Authenticates a user and returns a session if successful.
   * Handles account lockout and MFA verification.
   */
  static async login(email: string, password: string, totpCode?: string, ipAddress?: string, userAgent?: string) {
    const user = await prisma.user.findUnique({
      where: { email },
    });

    // To prevent user enumeration, we still hash a dummy password or return generic error
    if (!user) {
      await this.logLoginHistory('unknown', false, ipAddress, userAgent, 'Invalid credentials');
      throw new AppError('Invalid email or password', 401);
    }

    // Check if account is closed or suspended
    if (user.status === UserStatus.CLOSED || user.status === UserStatus.SUSPENDED) {
      throw new AppError('Account is not active', 403);
    }

    // Check account lockout
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await this.logLoginHistory(user.id, false, ipAddress, userAgent, 'Account locked');
      throw new AppError('Account is temporarily locked due to multiple failed login attempts', 403, 'ACCOUNT_LOCKED');
    }

    // Verify password
    const isPasswordValid = await comparePassword(password, user.passwordHash);

    if (!isPasswordValid) {
      await this.handleFailedLogin(user.id, user.failedLoginAttempts, ipAddress, userAgent);
      throw new AppError('Invalid email or password', 401);
    }

    // Verify MFA if enabled
    const mfaRecord = await prisma.mfaSecret.findUnique({ where: { userId: user.id } });
    if (mfaRecord && mfaRecord.enabled) {
      if (!totpCode) {
        throw new AppError('MFA code required', 403, 'MFA_REQUIRED');
      }

      const isMfaValid = await MfaService.verifyCode(user.id, totpCode);
      if (!isMfaValid) {
        await this.handleFailedLogin(user.id, user.failedLoginAttempts, ipAddress, userAgent, 'Invalid MFA code');
        throw new AppError('Invalid MFA code', 401);
      }
    }

    // Reset failed login attempts and update last login
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      },
    });

    await this.logLoginHistory(user.id, true, ipAddress, userAgent, null, !!(mfaRecord && mfaRecord.enabled));

    // Create session
    const session = await SessionService.createSession(user.id, user.email, user.role, ipAddress, userAgent);

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        status: user.status,
      },
      ...session,
    };
  }

  /**
   * Handles failed login attempts and locks account if threshold exceeded.
   */
  private static async handleFailedLogin(userId: string, currentAttempts: number, ipAddress?: string, userAgent?: string, reason: string = 'Invalid password') {
    const newAttempts = currentAttempts + 1;
    const maxAttempts = config.MAX_LOGIN_ATTEMPTS;

    let lockedUntil = null;
    if (newAttempts >= maxAttempts) {
      lockedUntil = new Date();
      lockedUntil.setMinutes(lockedUntil.getMinutes() + config.LOCKOUT_DURATION_MINUTES);
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        failedLoginAttempts: newAttempts,
        lockedUntil,
      },
    });

    await this.logLoginHistory(userId, false, ipAddress, userAgent, reason);
  }

  /**
   * Logs login attempts to the database.
   */
  private static async logLoginHistory(userId: string, success: boolean, ipAddress?: string, userAgent?: string, reason?: string | null, mfaUsed: boolean = false) {
    if (userId === 'unknown') return; // Don't log if user doesn't exist to prevent DB fill

    await prisma.loginHistory.create({
      data: {
        userId,
        ipAddress: ipAddress || 'unknown',
        userAgent: userAgent || 'unknown',
        success,
        mfaUsed,
        reason,
      },
    });
  }
}
