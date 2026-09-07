import { LogService } from '../services/LogService';
import { SyncLog } from '../../products/models/SyncLog';
import { sanitizeLogPayload } from '../../../shared/helpers/sanitizer';
import { ConflictError, NotFoundError } from '../../../shared/errors';

// Mock models and services
jest.mock('../../products/models/SyncLog');
jest.mock('../../orders/services/OrderService');
jest.mock('../../products/services/ProductService');

const MockSyncLog = SyncLog as jest.Mocked<typeof SyncLog>;

describe('Sanitizer Unit Tests', () => {
  it('should mask sensitive keys like apiKey, authorization, token, password', () => {
    const rawPayload = {
      username: 'admin',
      apiKey: 'secret_api_key_12345',
      authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
      headers: {
        'API-KEY': 'daftra_live_key',
        'content-type': 'application/json',
      },
      nested: {
        password: 'super_secure_password',
        clientSecret: 'secret_abc_123',
        normalData: 'Rahma Medical Supplies',
      },
    };

    const sanitized = sanitizeLogPayload(rawPayload);

    expect(sanitized.apiKey).toBe('***MASKED***');
    expect(sanitized.authorization).toBe('***MASKED***');
    expect(sanitized.headers['API-KEY']).toBe('***MASKED***');
    expect(sanitized.headers['content-type']).toBe('application/json');
    expect(sanitized.nested.password).toBe('***MASKED***');
    expect(sanitized.nested.clientSecret).toBe('***MASKED***');
    expect(sanitized.nested.normalData).toBe('Rahma Medical Supplies');
  });

  it('should handle circular references gracefully without stack overflow', () => {
    const circularObj: any = {
      name: 'Circular Test',
      meta: { info: 'details' },
    };
    circularObj.self = circularObj;
    circularObj.meta.parent = circularObj;

    expect(() => {
      const result = sanitizeLogPayload(circularObj);
      expect(result.name).toBe('Circular Test');
      expect(result.self).toBe('[Circular Reference]');
      expect(result.meta.parent).toBe('[Circular Reference]');
    }).not.toThrow();
  });
});

describe('LogService Unit Tests', () => {
  let service: LogService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new LogService();
  });

  describe('getStats()', () => {
    it('should calculate log stats and success rate accurately', async () => {
      (MockSyncLog.count as jest.Mock)
        .mockResolvedValueOnce(100) // total
        .mockResolvedValueOnce(85)  // SUCCESS
        .mockResolvedValueOnce(10)  // FAILED
        .mockResolvedValueOnce(3)   // PENDING
        .mockResolvedValueOnce(2);  // RETRYING

      const stats = await service.getStats();

      expect(stats.totalLogs).toBe(100);
      expect(stats.successCount).toBe(85);
      expect(stats.failedCount).toBe(10);
      expect(stats.pendingCount).toBe(3);
      expect(stats.retryingCount).toBe(2);
      expect(stats.successRate).toBe(85);
    });
  });

  describe('retryLog() — Optimistic Lock & Idempotency', () => {
    it('should throw ConflictError if log is already in RETRYING state', async () => {
      const mockLog = {
        id: 1,
        status: 'RETRYING',
        entityId: 10,
        entityType: 'ORDER',
      };

      (MockSyncLog.findByPk as jest.Mock).mockResolvedValue(mockLog);

      await expect(service.retryLog(1)).rejects.toThrow(ConflictError);
    });

    it('should throw ConflictError if log is already SUCCESS', async () => {
      const mockLog = {
        id: 2,
        status: 'SUCCESS',
        entityId: 10,
        entityType: 'ORDER',
      };

      (MockSyncLog.findByPk as jest.Mock).mockResolvedValue(mockLog);

      await expect(service.retryLog(2)).rejects.toThrow(ConflictError);
    });

    it('should throw NotFoundError if log does not exist', async () => {
      (MockSyncLog.findByPk as jest.Mock).mockResolvedValue(null);

      await expect(service.retryLog(999)).rejects.toThrow(NotFoundError);
    });

    it('should set status to RETRYING, dispatch retry to OrderService, and update to SUCCESS', async () => {
      const mockSave = jest.fn().mockResolvedValue(true);
      const mockToJSON = jest.fn().mockReturnValue({
        id: 5,
        status: 'SUCCESS',
        entityId: 42,
        entityType: 'ORDER',
        retriesCount: 1,
      });

      const mockLog: any = {
        id: 5,
        status: 'FAILED',
        entityId: 42,
        entityType: 'ORDER',
        retriesCount: 0,
        save: mockSave,
        toJSON: mockToJSON,
      };

      (MockSyncLog.findByPk as jest.Mock).mockResolvedValue(mockLog);

      // Mock OrderService retryOrder
      (service['orderService'].retryOrder as jest.Mock) = jest.fn().mockResolvedValue({
        id: 42,
        status: 'DRAFT_CREATED',
        daftraInvoiceNumber: 'INV-2026-0042',
      });

      const result = await service.retryLog(5);

      expect(mockLog.retriesCount).toBe(1);
      expect(mockSave).toHaveBeenCalledTimes(2); // once for RETRYING lock, once for final result
      expect(result.message).toContain('INV-2026-0042');
    });
  });
});
