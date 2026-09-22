import { Op } from 'sequelize';
import { SyncLog } from '../../products/models/SyncLog';
import { LogQueryFilters, LogStatsResponse } from '../dtos/log.dtos';
import { NotFoundError, ConflictError, AppError } from '../../../shared/errors';
import { sanitizeLogPayload } from '../../../shared/helpers/sanitizer';
import { logger } from '../../../shared/helpers/logger';
import { OrderService } from '../../orders/services/OrderService';
import { ProductService } from '../../products/services/ProductService';
import { productPollerService } from '../../products/services/ProductPollerService';
import { orderPollerService } from '../../orders/services/OrderPollerService';

export class LogService {
  private orderService: OrderService;
  private productService: ProductService;

  constructor() {
    this.orderService = new OrderService();
    this.productService = new ProductService();
  }

  /**
   * 1. Query logs with pagination, filtering, and sanitization
   */
  public async getLogs(filters: LogQueryFilters = {}): Promise<{
    logs: any[];
    pagination: {
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    };
  }> {
    const page = Math.max(1, Number(filters.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(filters.limit) || 20));
    const offset = (page - 1) * limit;

    const where: any = {};

    if (filters.entityType) {
      where.entityType = filters.entityType;
    }

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.direction) {
      where.direction = filters.direction;
    }

    if (filters.source) {
      where.source = filters.source;
    }

    // Date range filter
    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) {
        where.createdAt[Op.gte] = new Date(filters.startDate);
      }
      if (filters.endDate) {
        const end = new Date(filters.endDate);
        end.setHours(23, 59, 59, 999);
        where.createdAt[Op.lte] = end;
      }
    }

    // Free text search
    if (filters.search && filters.search.trim() !== '') {
      const searchTerm = `%${filters.search.trim()}%`;
      where[Op.or] = [
        { requestUrl: { [Op.like]: searchTerm } },
        { errorMessage: { [Op.like]: searchTerm } },
      ];
    }

    const { count, rows } = await SyncLog.findAndCountAll({
      where,
      limit,
      offset,
      order: [['createdAt', 'DESC']],
    });

    // Sanitize each row's payload/response to guarantee no secrets leak to the frontend
    const sanitizedLogs = rows.map((row) => {
      const plain = row.toJSON();
      return {
        ...plain,
        requestPayload: sanitizeLogPayload(plain.requestPayload),
        responseBody: sanitizeLogPayload(plain.responseBody),
      };
    });

    return {
      logs: sanitizedLogs,
      pagination: {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit),
      },
    };
  }

  /**
   * 2. Quick stats for KPI cards
   */
  public async getStats(): Promise<LogStatsResponse> {
    const totalLogs = await SyncLog.count();
    const successCount = await SyncLog.count({ where: { status: 'SUCCESS' } });
    const failedCount = await SyncLog.count({ where: { status: 'FAILED' } });
    const pendingCount = await SyncLog.count({ where: { status: 'PENDING' } });
    const retryingCount = await SyncLog.count({ where: { status: 'RETRYING' } });

    const successRate = totalLogs > 0 ? Math.round((successCount / totalLogs) * 100) : 100;

    return {
      totalLogs,
      successCount,
      failedCount,
      pendingCount,
      retryingCount,
      successRate,
    };
  }

  /**
   * 3. Get single log by ID with sanitized details
   */
  public async getLogById(id: number): Promise<any> {
    const log = await SyncLog.findByPk(id);
    if (!log) {
      throw new NotFoundError(`سجل العملية رقم #${id} غير موجود`);
    }

    const plain = log.toJSON();
    return {
      ...plain,
      requestPayload: sanitizeLogPayload(plain.requestPayload),
      responseBody: sanitizeLogPayload(plain.responseBody),
    };
  }

  /**
   * 4. Smart Retry with Optimistic Lock (In-flight guard)
   * Prevents duplicate clicks by locking status to RETRYING immediately.
   */
  public async retryLog(id: number): Promise<{ log: any; message: string }> {
    const log = await SyncLog.findByPk(id);
    if (!log) {
      throw new NotFoundError(`سجل العملية رقم #${id} غير موجود`);
    }

    if (log.status === 'RETRYING') {
      throw new ConflictError('هذه العملية قيد إعادة المحاولة حالياً. يرجى الانتظار.');
    }

    if (log.status === 'SUCCESS') {
      throw new ConflictError('هذه العملية ناجحة بالفعل ولا تتطلب إعادة محاولة.');
    }

    // 🔒 Optimistic Lock: Update status to RETRYING and increment count immediately
    log.status = 'RETRYING';
    log.retriesCount += 1;
    await log.save();
    logger.info(`[LogService] Locked log #${id} with status RETRYING (Attempt #${log.retriesCount})`);

    let executionMessage = '';
    const startTime = Date.now();

    try {
      if (!log.entityId) {
        // فحص دوري مجدول للنظام (Background Poller Retry)
        if (log.entityType === 'PRODUCT') {
          const pollRes = await productPollerService.pollProductsNow();
          if (pollRes.errorsCount === 0) {
            log.status = 'SUCCESS';
            log.errorMessage = null;
            executionMessage = 'تمت إعادة الفحص الدوري لمنتجات ومخزون دفترة بنجاح.';
          } else {
            log.status = 'FAILED';
            log.errorMessage = 'تعذر استكمال الفحص الدوري لمنتجات دفترة أثناء إعادة المحاولة';
            executionMessage = log.errorMessage;
          }
        } else if (log.entityType === 'ORDER') {
          const pollRes = await orderPollerService.pollOrdersNow();
          if (pollRes.errorsCount === 0) {
            log.status = 'SUCCESS';
            log.errorMessage = null;
            executionMessage = 'تمت إعادة فحص الطلبات بنجاح.';
          } else {
            log.status = 'FAILED';
            log.errorMessage = 'تعذر استكمال فحص الطلبات أثناء إعادة المحاولة';
            executionMessage = log.errorMessage;
          }
        } else {
          throw new AppError('لا يمكن إعادة المحاولة: معرّف الكيان (Entity ID) مفقود في السجل', 400);
        }
      } else if (log.entityType === 'ORDER') {
        const updatedOrder = await this.orderService.retryOrder(log.entityId);
        if (updatedOrder.status === 'DRAFT_CREATED') {
          log.status = 'SUCCESS';
          log.errorMessage = null;
          executionMessage = `تم إصدار مسودة الفاتورة ${updatedOrder.daftraInvoiceNumber || ''} بنجاح للطلب.`;
        } else {
          log.status = 'FAILED';
          log.errorMessage = updatedOrder.statusMessage || 'فشلت معالجة الطلب أثناء إعادة المحاولة';
          executionMessage = log.errorMessage;
        }
      } else if (log.entityType === 'PRODUCT') {
        const retryResult = await this.productService.retryPublish(log.entityId);
        log.status = 'SUCCESS';
        log.errorMessage = null;
        executionMessage = `تمت إعادة نشر المنتج بنجاح: ${retryResult.details}`;
      } else {
        throw new AppError(`نوع الكيان "${log.entityType}" لا يدعم إعادة المحاولة المباشرة`, 400);
      }
    } catch (err: any) {
      log.status = 'FAILED';
      log.errorMessage = err.message || 'حدث خطأ غير متوقع أثناء إعادة المحاولة';
      executionMessage = `فشلت إعادة المحاولة: ${log.errorMessage}`;
      logger.error(`[LogService] Retry failed for log #${id}:`, err);
    } finally {
      log.durationMs = Date.now() - startTime;
      await log.save();
    }

    const plain = log.toJSON();
    return {
      log: {
        ...plain,
        requestPayload: sanitizeLogPayload(plain.requestPayload),
        responseBody: sanitizeLogPayload(plain.responseBody),
      },
      message: executionMessage,
    };
  }
}

export const logService = new LogService();
