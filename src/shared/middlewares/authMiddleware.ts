import { Request, Response, NextFunction } from 'express';
import { authService } from '../../modules/auth/services/AuthService';
import { UnauthorizedError } from '../errors';

export const authMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new UnauthorizedError('يرجى تسجيل الدخول أولاً للوصول إلى هذا الرابط');
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    throw new UnauthorizedError('رمز التحقق مفقود');
  }

  // Verify and attach user to Request
  const decodedUser = authService.verifyToken(token);
  req.user = decodedUser;

  next();
};
