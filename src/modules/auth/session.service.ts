// ==============================================================
// SecureBank — Session Service
// Manages JWT token pairs and Redis blacklisting
// ==============================================================

import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../../shared/database';
import { signAccessToken, signRefreshToken, verifyToken } from '../../shared/security';
import { blacklistToken, storeRefreshToken, revokeAllUserTokens } from '../../shared/database/redis';
import { config } from '../../shared/config';
import { AppError } from '../../shared/middleware';
import { UserRole } from '@prisma/client';

export class SessionService {
  /**
   * Generates an access token and a refresh token for a user.
   */
  static async createSession(userId: string, email: string, role: UserRole, ipAddress?: string, userAgent?: string) {
    // 1. Generate access token
    const accessToken = signAccessToken({ userId, email, role });

    // 2. Generate refresh token
    const refreshTokenId = uuidv4();
    const refreshToken = signRefreshToken({ userId, email, role });

    // Calculate expiration date for DB
    const expiresInDays = parseInt(config.JWT_REFRESH_EXPIRATION);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + (isNaN(expiresInDays) ? 7 : expiresInDays));

    // 3. Save refresh token to DB (for auditing/revocation)
    await prisma.refreshToken.create({
      data: {
        userId,
        token: refreshToken,
        ipAddress,
        deviceInfo: userAgent,
        expiresAt,
      },
    });

    // 4. Save to Redis for fast validation
    const ttlSeconds = (isNaN(expiresInDays) ? 7 : expiresInDays) * 24 * 60 * 60;
    await storeRefreshToken(userId, refreshTokenId, ttlSeconds);

    return {
      accessToken,
      refreshToken,
      expiresIn: config.JWT_ACCESS_EXPIRATION,
    };
  }

  /**
   * Refreshes an access token using a valid refresh token.
   */
  static async refreshSession(refreshToken: string, ipAddress?: string, userAgent?: string) {
    try {
      // 1. Verify the JWT signature and expiration
      const decoded = verifyToken(refreshToken);

      if (decoded.type !== 'refresh') {
        throw new AppError('Invalid token type', 401);
      }

      // 2. Check if token exists and is valid in DB
      const storedToken = await prisma.refreshToken.findUnique({
        where: { token: refreshToken },
      });

      if (!storedToken || storedToken.revokedAt || storedToken.expiresAt < new Date()) {
        throw new AppError('Refresh token is invalid or expired', 401);
      }

      // 3. Revoke the old refresh token (token rotation)
      await prisma.refreshToken.update({
        where: { id: storedToken.id },
        data: { revokedAt: new Date() },
      });

      // 4. Create new session
      return await this.createSession(decoded.userId, decoded.email, decoded.role as UserRole, ipAddress, userAgent);
    } catch (error) {
      throw new AppError('Invalid or expired refresh token', 401);
    }
  }

  /**
   * Logs out a user from the current session.
   */
  static async logout(userId: string, accessToken: string, refreshToken?: string) {
    // 1. Blacklist the access token in Redis
    // Assuming 15m max lifetime, we blacklist for 15m to be safe.
    await blacklistToken(accessToken, 15 * 60);

    // 2. Revoke the refresh token in DB if provided
    if (refreshToken) {
      await prisma.refreshToken.updateMany({
        where: { userId, token: refreshToken },
        data: { revokedAt: new Date() },
      });
    }
  }

  /**
   * Logs out a user from all devices.
   */
  static async logoutAll(userId: string) {
    // 1. Revoke all refresh tokens in DB
    await prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    // 2. Clear all refresh tokens in Redis
    await revokeAllUserTokens(userId);

    // Note: Existing access tokens will still be valid until they expire (max 15 mins)
    // unless we maintain a user-level revision counter (not implemented here for simplicity,
    // but recommended for strict immediate global logout).
  }
}
