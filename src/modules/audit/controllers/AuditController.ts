import { Request, Response } from 'express';
import { auditService } from '../services/AuditService';
import { sendSuccess } from '../../../shared/helpers/responseFormatter';

export class AuditController {
  static getLogs = async (req: Request, res: Response): Promise<Response> => {
    const result = await auditService.getLogs({
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      userId: req.query.userId ? Number(req.query.userId) : undefined,
      action: req.query.action as string,
      status: req.query.status as any,
      search: req.query.search as string,
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
    });
    return sendSuccess(res, result, 'تم جلب سجل نشاط المستخدمين بنجاح');
  };
}
