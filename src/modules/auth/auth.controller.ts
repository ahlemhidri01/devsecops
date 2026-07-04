// ==============================================================
// SecureBank — Auth Controller
// Handles HTTP requests and responses for the auth module
// ==============================================================

import { Request, Response, NextFunction } from 'express';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';
import { MfaService } from './mfa.service';
import { AuthenticatedRequest } from '../../shared/types';

export class AuthController {
  static async register(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await AuthService.register(req.body);
      res.status(201).json({
        success: true,
        data: { user },
      });
    } catch (error) {
      next(error);
    }
  }

  static async login(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password, totpCode } = req.body;
      const ipAddress = req.ip;
      const userAgent = req.headers['user-agent'];

      const result = await AuthService.login(email, password, totpCode, ipAddress, userAgent);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  static async logout(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const authHeader = req.headers.authorization;
      const accessToken = authHeader?.split(' ')[1];
      const refreshToken = req.body.refreshToken;

      if (req.user && accessToken) {
        await SessionService.logout(req.user.userId, accessToken, refreshToken);
      }

      res.status(200).json({
        success: true,
        message: 'Logged out successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  static async logoutAll(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (req.user) {
        await SessionService.logoutAll(req.user.userId);
      }

      res.status(200).json({
        success: true,
        message: 'Logged out from all devices successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  static async refreshToken(req: Request, res: Response, next: NextFunction) {
    try {
      const { refreshToken } = req.body;
      const ipAddress = req.ip;
      const userAgent = req.headers['user-agent'];

      const result = await SessionService.refreshSession(refreshToken, ipAddress, userAgent);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  // --- MFA Setup ---

  static async generateMfa(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new Error('Unauthenticated');

      const result = await MfaService.generateSecret(req.user.userId, req.user.email);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  static async verifyAndEnableMfa(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new Error('Unauthenticated');

      const { code } = req.body;
      const result = await MfaService.verifyAndEnable(req.user.userId, code);

      res.status(200).json({
        success: true,
        message: 'MFA enabled successfully',
        data: result, // Contains backup codes
      });
    } catch (error) {
      next(error);
    }
  }
}
