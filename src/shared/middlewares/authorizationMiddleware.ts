import { NextFunction, Request, Response } from 'express';
import { Permission, hasPermission } from '../../modules/auth/permissions';
import { ForbiddenError, UnauthorizedError } from '../errors';

export const requirePermission = (permission: Permission) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new UnauthorizedError('يرجى تسجيل الدخول أولاً');
    }
    if (req.user.mustChangePassword) {
      throw new ForbiddenError('يجب تغيير كلمة المرور المؤقتة قبل تنفيذ أي عملية');
    }
    if (!hasPermission(req.user.role, permission)) {
      throw new ForbiddenError('ليس لديك صلاحية لتنفيذ هذه العملية');
    }
    next();
  };
};
