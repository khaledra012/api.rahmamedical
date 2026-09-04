import { ProductService } from '../services/ProductService';
import { Product } from '../models/Product';
import { ProductMapping } from '../models/ProductMapping';
import { SyncLog } from '../models/SyncLog';
import { zidClient } from '../../../shared/integrations/ZidClient';
import { trendyolClient } from '../../../shared/integrations/TrendyolClient';
import { mockDaftraProductWebhook } from '../../../shared/integrations/__mocks__/daftraFixtures';
import { mockZidProductCreatedResponse } from '../../../shared/integrations/__mocks__/zidFixtures';
import { mockTrendyolBatchResponse } from '../../../shared/integrations/__mocks__/trendyolFixtures';
import { ConflictError, NotFoundError } from '../../../shared/errors';

jest.mock('../models/Product');
jest.mock('../models/ProductMapping');
jest.mock('../models/SyncLog');
jest.mock('../../../shared/integrations/ZidClient');
jest.mock('../../../shared/integrations/TrendyolClient');

describe('ProductService Unit Tests', () => {
  let productService: ProductService;

  beforeEach(() => {
    productService = new ProductService();
    jest.clearAllMocks();
  });

  describe('handleIncomingWebhook() - Ingestion & Idempotency', () => {
    it('should ingest new product from Daftra and set status to PENDING_REVIEW with full raw data', async () => {
      (Product.findOne as jest.Mock).mockResolvedValue(null);
      const mockCreatedProduct = {
        id: 1,
        daftraProductId: 1359,
        sku: 'MED-MSK-01',
        nameAr: 'كمامة طبية 3 طبقات (علبة 50 حبة)',
        price: 25.0,
        publishStatus: 'PENDING_REVIEW',
        trendyolStatus: 'PENDING_REVIEW',
        rawDaftraData: mockDaftraProductWebhook,
      };
      (Product.create as jest.Mock).mockResolvedValue(mockCreatedProduct);
      (ProductMapping.create as jest.Mock).mockResolvedValue({});

      const result = await productService.handleIncomingWebhook(mockDaftraProductWebhook);

      expect(Product.findOne).toHaveBeenCalledWith({ where: { daftraProductId: 1359 } });
      expect(Product.create).toHaveBeenCalledWith(
        expect.objectContaining({
          daftraProductId: 1359,
          sku: 'MED-MSK-01',
          publishStatus: 'PENDING_REVIEW',
          trendyolStatus: 'PENDING_REVIEW',
          rawDaftraData: mockDaftraProductWebhook,
        })
      );
      expect(result.publishStatus).toBe('PENDING_REVIEW');
    });

    it('should idempotently update existing product when Daftra resends product webhook', async () => {
      const existingProduct = {
        id: 1,
        daftraProductId: 1359,
        sku: 'MED-MSK-01',
        nameAr: 'اسم قديم',
        price: 20.0,
        save: jest.fn().mockResolvedValue(true),
      };
      (Product.findOne as jest.Mock).mockResolvedValue(existingProduct);
      (ProductMapping.findOne as jest.Mock).mockResolvedValue(null);

      await productService.handleIncomingWebhook(mockDaftraProductWebhook);

      expect(existingProduct.nameAr).toBe(mockDaftraProductWebhook.name);
      expect(existingProduct.price).toBe(25.0);
      expect(existingProduct.save).toHaveBeenCalled();
      expect(Product.create).not.toHaveBeenCalled();
    });
  });

  describe('publishToZid() & publishToTrendyol()', () => {
    it('should prevent rapid double publishing by throwing ConflictError when status is PUBLISHING', async () => {
      const busyProduct = {
        id: 1,
        publishStatus: 'PUBLISHING',
      };
      (Product.findByPk as jest.Mock).mockResolvedValue(busyProduct);

      await expect(productService.publishToZid(1)).rejects.toThrow(ConflictError);
    });

    it('should successfully publish product to Zid and update status to PUBLISHED', async () => {
      const mockProduct = {
        id: 1,
        daftraProductId: 1359,
        sku: 'MED-MSK-01',
        barcode: '6281001070012',
        nameAr: 'كمامة طبية',
        price: 25.0,
        publishStatus: 'PENDING_REVIEW',
        publishError: null,
        save: jest.fn().mockResolvedValue(true),
      };

      (Product.findByPk as jest.Mock).mockResolvedValue(mockProduct);
      (zidClient.createProduct as jest.Mock).mockResolvedValue(mockZidProductCreatedResponse);

      const mockMapping = {
        zidProductId: null,
        syncStatus: 'PENDING',
        save: jest.fn().mockResolvedValue(true),
      };
      (ProductMapping.findOrCreate as jest.Mock).mockResolvedValue([mockMapping]);
      (SyncLog.create as jest.Mock).mockResolvedValue({});

      const result = await productService.publishToZid(1);

      expect(mockProduct.publishStatus).toBe('PUBLISHED');
      expect(result.zidProductId).toBe(mockZidProductCreatedResponse.product.id);
    });

    it('should successfully publish product to Trendyol and update trendyolStatus to PUBLISHED', async () => {
      const mockProduct = {
        id: 1,
        daftraProductId: 1359,
        sku: 'MED-MSK-01',
        barcode: '6281001070012',
        nameAr: 'كمامة طبية',
        price: 25.0,
        trendyolStatus: 'PENDING_REVIEW',
        trendyolError: null,
        save: jest.fn().mockResolvedValue(true),
      };

      (Product.findByPk as jest.Mock).mockResolvedValue(mockProduct);
      (trendyolClient.createProducts as jest.Mock).mockResolvedValue(mockTrendyolBatchResponse);

      const mockMapping = {
        trendyolBatchRequestId: null,
        trendyolStatus: 'PENDING',
        save: jest.fn().mockResolvedValue(true),
      };
      (ProductMapping.findOrCreate as jest.Mock).mockResolvedValue([mockMapping]);
      (SyncLog.create as jest.Mock).mockResolvedValue({});

      const result = await productService.publishToTrendyol(1);

      expect(mockProduct.trendyolStatus).toBe('PUBLISHED');
      expect(result.batchRequestId).toBe(mockTrendyolBatchResponse.batchRequestId);
    });
  });

  describe('retryPublish() - Smart Targeted Retry', () => {
    it('should retry ZID ONLY if Zid is FAILED and Trendyol is already PUBLISHED', async () => {
      const mockProduct = {
        id: 1,
        daftraProductId: 1359,
        sku: 'MED-MSK-01',
        nameAr: 'كمامة',
        price: 25.0,
        publishStatus: 'FAILED',
        trendyolStatus: 'PUBLISHED',
        save: jest.fn().mockResolvedValue(true),
      };

      (Product.findByPk as jest.Mock).mockResolvedValue(mockProduct);
      (zidClient.createProduct as jest.Mock).mockResolvedValue(mockZidProductCreatedResponse);
      (ProductMapping.findOrCreate as jest.Mock).mockResolvedValue([{ save: jest.fn() }]);
      (SyncLog.create as jest.Mock).mockResolvedValue({});

      const result = await productService.retryPublish(1);

      expect(zidClient.createProduct).toHaveBeenCalledTimes(1);
      expect(trendyolClient.createProducts).not.toHaveBeenCalled();
      expect(result.details).toContain('متجر زد');
    });

    it('should retry TRENDYOL ONLY if Trendyol is FAILED and Zid is already PUBLISHED', async () => {
      const mockProduct = {
        id: 1,
        daftraProductId: 1359,
        sku: 'MED-MSK-01',
        barcode: '6281001070012',
        nameAr: 'كمامة',
        price: 25.0,
        publishStatus: 'PUBLISHED',
        trendyolStatus: 'FAILED',
        save: jest.fn().mockResolvedValue(true),
      };

      (Product.findByPk as jest.Mock).mockResolvedValue(mockProduct);
      (trendyolClient.createProducts as jest.Mock).mockResolvedValue(mockTrendyolBatchResponse);
      (ProductMapping.findOrCreate as jest.Mock).mockResolvedValue([{ save: jest.fn() }]);
      (SyncLog.create as jest.Mock).mockResolvedValue({});

      const result = await productService.retryPublish(1);

      expect(trendyolClient.createProducts).toHaveBeenCalledTimes(1);
      expect(zidClient.createProduct).not.toHaveBeenCalled();
      expect(result.details).toContain('ترينديول');
    });
  });
});
