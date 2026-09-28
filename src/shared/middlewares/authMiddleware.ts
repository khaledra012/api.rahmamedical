import { Request, Response, NextFunction } from 'express';
import { authService } from '../../modules/auth/services/AuthService';
import { UnauthorizedError } from '../errors';

export const authMiddleware = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('يرجى تسجيل الدخول أولاً للوصول إلى هذا الرابط');
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      throw new UnauthorizedError('رمز التحقق مفقود');
    }

    const decodedUser = authService.verifyToken(token);
    const currentUser = await authService.getCurrentUser(decodedUser.id);
    req.user = {
      id: currentUser.id,
      email: currentUser.email,
      username: currentUser.username,
      name: currentUser.name,
      role: currentUser.role,
      mustChangePassword: currentUser.mustChangePassword,
    };
    next();
  } catch (error) {
    next(error);
  }
};
