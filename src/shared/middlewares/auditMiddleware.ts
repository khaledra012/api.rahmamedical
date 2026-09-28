import { NextFunction, Request, Response } from 'express';
import { auditService } from '../../modules/audit/services/AuditService';
import { logger } from '../helpers/logger';
import { sanitizeLogPayload } from '../helpers/sanitizer';

interface AuditOptions {
  entityType?: string;
  entityIdParam?: string;
  useCurrentUserId?: boolean;
}

export const auditAction = (action: string, options: AuditOptions = {}) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    res.once('finish', () => {
      const entityId = options.useCurrentUserId
        ? req.user?.id
        : res.locals.auditEntityId ?? (options.entityIdParam ? req.params[options.entityIdParam] : null);

      auditService
        .record({
          user: req.user || null,
          action,
          method: req.method,
          path: req.originalUrl,
          entityType: options.entityType || null,
          entityId,
          status: res.statusCode >= 200 && res.statusCode < 400 ? 'SUCCESS' : 'FAILED',
          statusCode: res.statusCode,
          ipAddress: req.ip,
          userAgent: req.get('user-agent') || null,
          details: res.locals.auditDetails ?? (Object.keys(req.body || {}).length > 0 ? sanitizeLogPayload(req.body) : null),
        })
        .catch((error) => logger.error(`[Audit] Could not record ${action}:`, error));
    });
    next();
  };
};
