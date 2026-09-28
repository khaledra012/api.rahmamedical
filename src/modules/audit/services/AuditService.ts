import { Op } from 'sequelize';
import { AuditLog } from '../models/AuditLog';
import { sanitizeLogPayload } from '../../../shared/helpers/sanitizer';

interface AuditActor {
  id: number;
  name?: string;
  email: string;
  role: string;
}

interface RecordAuditInput {
  user?: AuditActor | null;
  action: string;
  method: string;
  path: string;
  entityType?: string | null;
  entityId?: string | number | null;
  status: 'SUCCESS' | 'FAILED';
  statusCode: number;
  ipAddress?: string | null;
  userAgent?: string | null;
  details?: object | null;
}

interface AuditFilters {
  page?: number;
  limit?: number;
  userId?: number;
  action?: string;
  status?: 'SUCCESS' | 'FAILED';
  search?: string;
  startDate?: string;
  endDate?: string;
}

export class AuditService {
  async record(input: RecordAuditInput): Promise<AuditLog> {
    return AuditLog.create({
      userId: input.user?.id || null,
      userName: input.user?.name || input.user?.email || 'SYSTEM',
      userEmail: input.user?.email || null,
      userRole: input.user?.role || null,
      action: input.action,
      method: input.method,
      path: input.path,
      entityType: input.entityType || null,
      entityId: input.entityId === undefined || input.entityId === null ? null : String(input.entityId),
      status: input.status,
      statusCode: input.statusCode,
      ipAddress: input.ipAddress || null,
      userAgent: input.userAgent || null,
      details: input.details ? sanitizeLogPayload(input.details) : null,
    });
  }

  async getLogs(filters: AuditFilters = {}) {
    const page = Math.max(1, Number(filters.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(filters.limit) || 20));
    const where: any = {};

    if (filters.userId) where.userId = filters.userId;
    if (filters.action) where.action = filters.action;
    if (filters.status) where.status = filters.status;
    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt[Op.gte] = new Date(filters.startDate);
      if (filters.endDate) where.createdAt[Op.lte] = new Date(filters.endDate);
    }
    if (filters.search?.trim()) {
      const query = `%${filters.search.trim()}%`;
      where[Op.or] = [
        { userName: { [Op.like]: query } },
        { userEmail: { [Op.like]: query } },
        { action: { [Op.like]: query } },
        { entityId: { [Op.like]: query } },
      ];
    }

    const { rows, count } = await AuditLog.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit,
      offset: (page - 1) * limit,
    });

    return {
      logs: rows,
      pagination: { total: count, page, limit, totalPages: Math.ceil(count / limit) },
    };
  }
}

export const auditService = new AuditService();
