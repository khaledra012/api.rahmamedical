import { Request, Response } from 'express';
import { authService } from '../services/AuthService';
import { sendSuccess } from '../../../shared/helpers/responseFormatter';
import { UnauthorizedError } from '../../../shared/errors';
import { AuthenticatedUser } from '../dtos/auth.dtos';
import { auditService } from '../../audit/services/AuditService';

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

export class AuthController {
  /**
   * POST /api/auth/login
   */
  public login = async (req: Request, res: Response): Promise<Response> => {
    const identifier = req.body.identifier || req.body.email;
    const { password } = req.body;
    const result = await authService.login({ identifier, password });
    await auditService.record({
      user: result.user,
      action: 'AUTH_LOGIN',
      method: req.method,
      path: req.originalUrl,
      status: 'SUCCESS',
      statusCode: 200,
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || null,
    });
    return sendSuccess(res, result, 'تم تسجيل الدخول بنجاح', 200);
  };

  /**
   * GET /api/auth/me
   */
  public getMe = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
    if (!req.user || !req.user.id) {
      throw new UnauthorizedError('المستخدم غير مسجل');
    }

    const user = await authService.getCurrentUser(req.user.id);
    return sendSuccess(res, user, 'تم جلب بيانات المستخدم بنجاح', 200);
  };

  /**
   * POST /api/auth/change-password
   */
  public changePassword = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
    if (!req.user || !req.user.id) {
      throw new UnauthorizedError('المستخدم غير مسجل');
    }

    const { currentPassword, newPassword } = req.body;
    await authService.changePassword(req.user.id, { currentPassword, newPassword });
    return sendSuccess(res, null, 'تم تغيير كلمة المرور بنجاح', 200);
  };

  public logout = async (_req: AuthenticatedRequest, res: Response): Promise<Response> => {
    return sendSuccess(res, null, 'تم تسجيل الخروج بنجاح', 200);
  };
}

export const authController = new AuthController();
