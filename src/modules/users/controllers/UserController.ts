import { Request, Response } from 'express';
import { userService } from '../services/UserService';
import { sendCreated, sendSuccess } from '../../../shared/helpers/responseFormatter';
import { UnauthorizedError } from '../../../shared/errors';
import { User } from '../../auth/models/User';

export class UserController {
  static list = async (_req: Request, res: Response): Promise<Response> => {
    const users = await userService.listUsers();
    return sendSuccess(res, users, 'تم جلب المستخدمين بنجاح');
  };

  static create = async (req: Request, res: Response): Promise<Response> => {
    const user = await userService.createUser(req.body);
    res.locals.auditEntityId = user.id;
    return sendCreated(res, user, 'تم إنشاء المستخدم وإرسال كلمة المرور المؤقتة بنجاح');
  };

  static update = async (req: Request, res: Response): Promise<Response> => {
    if (!req.user) throw new UnauthorizedError();
    const beforeUser = await User.findByPk(Number(req.params.id));
    const before = beforeUser
      ? { name: beforeUser.name, username: beforeUser.username, email: beforeUser.email, role: beforeUser.role, isActive: beforeUser.isActive }
      : null;
    const user = await userService.updateUser(req.user.id, Number(req.params.id), req.body);
    res.locals.auditDetails = {
      before,
      after: { name: user.name, username: user.username, email: user.email, role: user.role, isActive: user.isActive },
    };
    return sendSuccess(res, user, 'تم تحديث بيانات المستخدم بنجاح');
  };

  static resetPassword = async (req: Request, res: Response): Promise<Response> => {
    const user = await userService.resetPassword(Number(req.params.id), req.body.password);
    return sendSuccess(res, user, 'تم تعيين كلمة مرور مؤقتة جديدة');
  };
}
