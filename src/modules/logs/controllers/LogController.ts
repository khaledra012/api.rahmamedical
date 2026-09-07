import { Request, Response } from 'express';
import { logService } from '../services/LogService';
import { sendSuccess } from '../../../shared/helpers/responseFormatter';

export class LogController {
  /**
   * GET /api/logs - List logs with filters and pagination
   */
  public static async getLogs(req: Request, res: Response): Promise<void> {
    const { page, limit, entityType, status, direction, source, search, startDate, endDate } = req.query;

    const result = await logService.getLogs({
      page: page ? parseInt(page as string, 10) : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      entityType: entityType as any,
      status: status as any,
      direction: direction as any,
      source: source as any,
      search: search as string,
      startDate: startDate as string,
      endDate: endDate as string,
    });

    sendSuccess(res, result, 'تم جلب سجل العمليات بنجاح');
  }

  /**
   * GET /api/logs/stats - Quick stats summary
   */
  public static async getStats(req: Request, res: Response): Promise<void> {
    const stats = await logService.getStats();
    sendSuccess(res, stats, 'تم جلب إحصائيات العمليات بنجاح');
  }

  /**
   * GET /api/logs/:id - Single log details
   */
  public static async getLogById(req: Request, res: Response): Promise<void> {
    const id = parseInt(req.params.id as string, 10);
    const log = await logService.getLogById(id);
    sendSuccess(res, log, 'تم جلب تفاصيل السجل بنجاح');
  }

  /**
   * POST /api/logs/:id/retry - Retry single operation
   */
  public static async retryLog(req: Request, res: Response): Promise<void> {
    const id = parseInt(req.params.id as string, 10);
    const result = await logService.retryLog(id);
    sendSuccess(res, result.log, result.message);
  }
}
