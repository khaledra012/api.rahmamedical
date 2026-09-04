import { OrderService } from '../services/OrderService';
import { Order } from '../models/Order';
import { OrderItem } from '../models/OrderItem';
import { PaymentMapping } from '../models/PaymentMapping';
import { Product } from '../../products/models/Product';
import { ProductMapping } from '../../products/models/ProductMapping';
import { SyncLog } from '../../products/models/SyncLog';
import { daftraClient } from '../../../shared/integrations/DaftraClient';
import {
  mockZidOrderWebhook,
  mockTrendyolOrderWebhook,
  mockOrderWithUnmappedPayment,
  mockDaftraInvoiceCreatedResponse,
} from '../../../shared/integrations/__mocks__/orderFixtures';

// ──────────────────────────────────────────────────────────────────
// Mock all external dependencies
// ──────────────────────────────────────────────────────────────────
jest.mock('../models/Order');
jest.mock('../models/OrderItem');
jest.mock('../models/PaymentMapping');
jest.mock('../../products/models/Product');
jest.mock('../../products/models/ProductMapping');
jest.mock('../../products/models/SyncLog');
jest.mock('../../../shared/integrations/DaftraClient');

const MockOrder = Order as jest.Mocked<typeof Order>;
const MockOrderItem = OrderItem as jest.Mocked<typeof OrderItem>;
const MockPaymentMapping = PaymentMapping as jest.Mocked<typeof PaymentMapping>;
const MockProduct = Product as jest.Mocked<typeof Product>;
const MockProductMapping = ProductMapping as jest.Mocked<typeof ProductMapping>;
const MockSyncLog = SyncLog as jest.Mocked<typeof SyncLog>;
const MockDaftraClient = daftraClient as jest.Mocked<typeof daftraClient>;

describe('OrderService Unit Tests', () => {
  let service: OrderService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new OrderService();
  });

  // ──────────────────────────────────────────────────────────────
  // 1. Idempotency Guard Tests
  // ──────────────────────────────────────────────────────────────
  describe('handleIncomingOrder() — Idempotency Guard', () => {
    it('should skip duplicate order and return the existing order without creating a new one', async () => {
      const existingOrder = {
        id: 1,
        storeOrderId: 'ZID-10245',
        status: 'DRAFT_CREATED',
      };

      (MockOrder.findOne as jest.Mock).mockResolvedValue(existingOrder);

      const result = await service.handleIncomingOrder(mockZidOrderWebhook);

      expect(result).toBe(existingOrder);
      expect(MockOrder.create).not.toHaveBeenCalled();
      expect(MockDaftraClient.createInvoice).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────────────
  // 2. Unmapped Payment Circuit Breaker Tests
  // ──────────────────────────────────────────────────────────────
  describe('handleIncomingOrder() — Unmapped Payment Circuit Breaker', () => {
    it('should HALT order with status UNMAPPED_PAYMENT when payment method is not in mapping table', async () => {
      // No existing order (not a duplicate)
      (MockOrder.findOne as jest.Mock).mockResolvedValue(null);

      // Mock order creation
      const createdOrder = {
        id: 99,
        storeOrderId: 'ZID-99999',
        storeType: 'ZID',
        paymentMethod: 'crypto_wallet',
        status: 'PROCESSING',
        statusMessage: null,
        treasuryId: null,
        save: jest.fn().mockResolvedValue(true),
      };
      (MockOrder.create as jest.Mock).mockResolvedValue(createdOrder);

      // Mock product matching success for all items
      (MockProductMapping.findOne as jest.Mock).mockResolvedValue({ daftraProductId: 1359 });

      // Mock order items creation
      (MockOrderItem.create as jest.Mock).mockResolvedValue({});

      // KEY: No payment mapping found — circuit breaker triggers
      (MockPaymentMapping.findOne as jest.Mock).mockResolvedValue(null);

      const result = await service.handleIncomingOrder(mockOrderWithUnmappedPayment);

      expect(result.status).toBe('UNMAPPED_PAYMENT');
      expect(result.statusMessage).toContain('crypto_wallet');
      expect(result.save).toHaveBeenCalled();
      expect(MockDaftraClient.createInvoice).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────────────
  // 3. Draft Invoice Creation (Zid Order — Happy Path)
  // ──────────────────────────────────────────────────────────────
  describe('handleIncomingOrder() — Zid Draft Invoice Creation', () => {
    it('should create a DRAFT invoice in Daftra for a valid Zid order', async () => {
      // No existing order
      (MockOrder.findOne as jest.Mock).mockResolvedValue(null);

      // Mock order creation
      const createdOrder = {
        id: 1,
        storeOrderId: 'ZID-10245',
        storeType: 'ZID',
        paymentMethod: 'tabby',
        shippingFee: 25.0,
        totalAmount: 106.75,
        orderDate: new Date('2026-09-03T14:30:00Z'),
        customerName: 'د. خالد السعود',
        customerPhone: '0501234567',
        shippingAddress: 'الرياض - حي السليمانية',
        status: 'PROCESSING',
        statusMessage: null,
        daftraDraftInvoiceId: null,
        daftraInvoiceNumber: null,
        treasuryId: null,
        save: jest.fn().mockResolvedValue(true),
      };
      (MockOrder.create as jest.Mock).mockResolvedValue(createdOrder);

      // Mock product matching success
      (MockProductMapping.findOne as jest.Mock).mockResolvedValue({ daftraProductId: 1359 });

      // Mock order items
      (MockOrderItem.create as jest.Mock).mockResolvedValue({});
      const matchedItems = mockZidOrderWebhook.items.map((item: any, i: number) => ({
        id: i + 1,
        orderId: 1,
        sku: item.sku,
        daftraProductId: 1359,
        matchStatus: 'MATCHED',
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        discount: item.discount,
        taxPercentage: item.taxPercentage,
        lineTotal: item.lineTotal,
      }));
      (MockOrderItem.findAll as jest.Mock).mockResolvedValue(matchedItems);

      // Mock payment mapping found
      (MockPaymentMapping.findOne as jest.Mock).mockResolvedValue({
        paymentMethodKey: 'tabby',
        treasuryId: 19,
        treasuryName: 'tabby',
        paymentMethodLabel: 'تابي (Tabby)',
        isActive: true,
      });

      // Mock Daftra response
      (MockDaftraClient.createInvoice as jest.Mock).mockResolvedValue(mockDaftraInvoiceCreatedResponse);

      // Mock SyncLog
      (MockSyncLog.create as jest.Mock).mockResolvedValue({});

      const result = await service.handleIncomingOrder(mockZidOrderWebhook);

      expect(result.status).toBe('DRAFT_CREATED');
      expect(result.daftraDraftInvoiceId).toBe(1025);
      expect(result.daftraInvoiceNumber).toBe('INV-2026-1025');
      expect(MockDaftraClient.createInvoice).toHaveBeenCalledTimes(1);

      // Verify the payload sent to Daftra
      const sentPayload = (MockDaftraClient.createInvoice as jest.Mock).mock.calls[0][0];
      expect(sentPayload.Invoice.is_draft).toBe(1);
      expect(sentPayload.Invoice.storehouse_id).toBe(3);
      expect(sentPayload.Payment[0].treasury_id).toBe(19);
    });
  });

  // ──────────────────────────────────────────────────────────────
  // 4. Trendyol Order — Channel Revenue Separation
  // ──────────────────────────────────────────────────────────────
  describe('handleIncomingOrder() — Trendyol Channel Revenue Separation', () => {
    it('should route Trendyol order revenue to trendyolRevenueAccountId (4690)', async () => {
      (MockOrder.findOne as jest.Mock).mockResolvedValue(null);

      const createdOrder = {
        id: 2,
        storeOrderId: 'TRN-88501',
        storeType: 'TRENDYOL',
        paymentMethod: 'trendyol_prepaid',
        shippingFee: 0,
        totalAmount: 287.5,
        orderDate: new Date('2026-09-03T16:00:00Z'),
        customerName: 'مستشفى الحبيب',
        customerPhone: '0112345678',
        shippingAddress: 'الرياض',
        status: 'PROCESSING',
        statusMessage: null,
        daftraDraftInvoiceId: null,
        daftraInvoiceNumber: null,
        treasuryId: null,
        save: jest.fn().mockResolvedValue(true),
      };
      (MockOrder.create as jest.Mock).mockResolvedValue(createdOrder);

      (MockProductMapping.findOne as jest.Mock).mockResolvedValue({ daftraProductId: 1359 });
      (MockOrderItem.create as jest.Mock).mockResolvedValue({});
      const matchedItems = [
        {
          id: 1,
          orderId: 2,
          sku: 'MED-MSK-01',
          daftraProductId: 1359,
          matchStatus: 'MATCHED',
          unitPrice: 25.0,
          quantity: 10,
          discount: 0,
          taxPercentage: 15,
          lineTotal: 250.0,
        },
      ];
      (MockOrderItem.findAll as jest.Mock).mockResolvedValue(matchedItems);

      (MockPaymentMapping.findOne as jest.Mock).mockResolvedValue({
        paymentMethodKey: 'trendyol_prepaid',
        treasuryId: 25,
        treasuryName: 'prepaid_trendyol',
        paymentMethodLabel: 'تسوية ترينديول (Prepaid)',
        isActive: true,
      });

      (MockDaftraClient.createInvoice as jest.Mock).mockResolvedValue({
        result: 'successful',
        data: { Invoice: { id: 2050, number: 'INV-2026-2050' } },
      });
      (MockSyncLog.create as jest.Mock).mockResolvedValue({});

      const result = await service.handleIncomingOrder(mockTrendyolOrderWebhook);

      expect(result.status).toBe('DRAFT_CREATED');

      // Verify revenue account is the Trendyol-specific one (4690)
      const sentPayload = (MockDaftraClient.createInvoice as jest.Mock).mock.calls[0][0];
      expect(sentPayload.InvoiceItem[0].account_id).toBe(4690);
      expect(sentPayload.Payment[0].treasury_id).toBe(25);
      // Verify notes mention ترينديول
      expect(sentPayload.Invoice.notes).toContain('ترينديول');
    });
  });

  // ──────────────────────────────────────────────────────────────
  // 5. Unmatched Product — Halt Order
  // ──────────────────────────────────────────────────────────────
  describe('handleIncomingOrder() — Unmatched Product Detection', () => {
    it('should HALT order with UNMAPPED_PRODUCT when SKU cannot be matched in Daftra', async () => {
      (MockOrder.findOne as jest.Mock).mockResolvedValue(null);

      const createdOrder = {
        id: 3,
        storeOrderId: 'ZID-10245',
        storeType: 'ZID',
        paymentMethod: 'tabby',
        status: 'PROCESSING',
        statusMessage: null,
        treasuryId: null,
        save: jest.fn().mockResolvedValue(true),
      };
      (MockOrder.create as jest.Mock).mockResolvedValue(createdOrder);

      // Product NOT found in any layer
      (MockProductMapping.findOne as jest.Mock).mockResolvedValue(null);
      (MockProduct.findOne as jest.Mock).mockResolvedValue(null);

      (MockOrderItem.create as jest.Mock).mockResolvedValue({});

      // Payment mapping is fine
      (MockPaymentMapping.findOne as jest.Mock).mockResolvedValue({
        paymentMethodKey: 'tabby',
        treasuryId: 19,
        treasuryName: 'tabby',
        paymentMethodLabel: 'تابي (Tabby)',
        isActive: true,
      });

      // All items are unmatched
      const unmatchedItems = mockZidOrderWebhook.items.map((item: any, i: number) => ({
        id: i + 1,
        orderId: 3,
        sku: item.sku,
        daftraProductId: null,
        matchStatus: 'UNMATCHED',
      }));
      (MockOrderItem.findAll as jest.Mock).mockResolvedValue(unmatchedItems);

      const result = await service.handleIncomingOrder(mockZidOrderWebhook);

      expect(result.status).toBe('UNMAPPED_PRODUCT');
      expect(result.statusMessage).toContain('MED-MSK-01');
      expect(MockDaftraClient.createInvoice).not.toHaveBeenCalled();
    });

    it('should successfully match legacy product by querying Daftra online when not found locally', async () => {
      (MockOrder.findOne as jest.Mock).mockResolvedValue(null);

      const createdOrder = {
        id: 5,
        storeOrderId: 'ZID-88888',
        storeType: 'ZID',
        paymentMethod: 'tabby',
        shippingFee: 25.0,
        totalAmount: 106.75,
        orderDate: new Date(),
        customerName: 'د. خالد',
        customerPhone: '0501234567',
        shippingAddress: 'الرياض',
        status: 'PROCESSING',
        statusMessage: null,
        daftraDraftInvoiceId: null,
        daftraInvoiceNumber: null,
        treasuryId: null,
        save: jest.fn().mockResolvedValue(true),
      };
      (MockOrder.create as jest.Mock).mockResolvedValue(createdOrder);

      // Not found locally
      (MockProductMapping.findOne as jest.Mock).mockResolvedValue(null);
      (MockProduct.findOne as jest.Mock).mockResolvedValue(null);
      (MockOrderItem.create as jest.Mock).mockResolvedValue({});

      // KEY: Found online in Daftra by SKU!
      (MockDaftraClient.searchProductBySku as jest.Mock).mockResolvedValue({
        id: 777,
        product_code: 'MED-MSK-01',
        name: 'كمامة طبية قديمة',
        unit_price: 25,
      });

      const matchedItems = [
        {
          id: 1, orderId: 5, sku: 'MED-MSK-01', daftraProductId: 777, matchStatus: 'MATCHED',
          unitPrice: 25, quantity: 2, discount: 0, taxPercentage: 15, lineTotal: 50,
        },
      ];
      (MockOrderItem.findAll as jest.Mock).mockResolvedValue(matchedItems);

      (MockPaymentMapping.findOne as jest.Mock).mockResolvedValue({
        paymentMethodKey: 'tabby', treasuryId: 19, treasuryName: 'tabby', paymentMethodLabel: 'تابي', isActive: true,
      });

      (MockDaftraClient.createInvoice as jest.Mock).mockResolvedValue({
        result: 'successful',
        data: { Invoice: { id: 3001, number: 'INV-2026-3001' } },
      });
      (MockSyncLog.create as jest.Mock).mockResolvedValue({});

      const singleItemPayload = {
        ...mockZidOrderWebhook,
        storeOrderId: 'ZID-88888',
        items: [mockZidOrderWebhook.items[0]],
      };

      const result = await service.handleIncomingOrder(singleItemPayload);

      expect(MockDaftraClient.searchProductBySku).toHaveBeenCalledWith('MED-MSK-01');
      expect(result.status).toBe('DRAFT_CREATED');
      expect(result.daftraDraftInvoiceId).toBe(3001);
    });
  });

  // ──────────────────────────────────────────────────────────────
  // 6. Daftra API Failure — Graceful Error Handling
  // ──────────────────────────────────────────────────────────────
  describe('handleIncomingOrder() — Daftra API Failure Recovery', () => {
    it('should set status to FAILED and log error when Daftra API is unreachable', async () => {
      (MockOrder.findOne as jest.Mock).mockResolvedValue(null);

      const createdOrder = {
        id: 4,
        storeOrderId: 'ZID-10245',
        storeType: 'ZID',
        paymentMethod: 'tabby',
        shippingFee: 25.0,
        totalAmount: 106.75,
        orderDate: new Date(),
        customerName: 'د. خالد',
        customerPhone: '0501234567',
        shippingAddress: 'الرياض',
        status: 'PROCESSING',
        statusMessage: null,
        daftraDraftInvoiceId: null,
        daftraInvoiceNumber: null,
        treasuryId: null,
        save: jest.fn().mockResolvedValue(true),
      };
      (MockOrder.create as jest.Mock).mockResolvedValue(createdOrder);

      (MockProductMapping.findOne as jest.Mock).mockResolvedValue({ daftraProductId: 1359 });
      (MockOrderItem.create as jest.Mock).mockResolvedValue({});

      const matchedItems = mockZidOrderWebhook.items.map((item: any, i: number) => ({
        id: i + 1, orderId: 4, sku: item.sku, daftraProductId: 1359, matchStatus: 'MATCHED',
        unitPrice: item.unitPrice, quantity: item.quantity, discount: item.discount, taxPercentage: item.taxPercentage,
      }));
      (MockOrderItem.findAll as jest.Mock).mockResolvedValue(matchedItems);

      (MockPaymentMapping.findOne as jest.Mock).mockResolvedValue({
        paymentMethodKey: 'tabby', treasuryId: 19, treasuryName: 'tabby', paymentMethodLabel: 'تابي', isActive: true,
      });

      // Daftra API is DOWN!
      (MockDaftraClient.createInvoice as jest.Mock).mockRejectedValue(
        new Error('تعذر الاتصال بخادم دفترة: ECONNREFUSED')
      );

      (MockSyncLog.create as jest.Mock).mockResolvedValue({});

      const result = await service.handleIncomingOrder(mockZidOrderWebhook);

      expect(result.status).toBe('FAILED');
      expect(result.statusMessage).toContain('ECONNREFUSED');
      expect(MockSyncLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'FAILED', entityType: 'ORDER' })
      );
    });
  });

  // ──────────────────────────────────────────────────────────────
  // 7. Retry Logic Tests
  // ──────────────────────────────────────────────────────────────
  describe('retryOrder() — Smart Retry', () => {
    it('should throw ConflictError when order already has DRAFT_CREATED status', async () => {
      (MockOrder.findByPk as jest.Mock).mockResolvedValue({
        id: 1,
        status: 'DRAFT_CREATED',
      });

      await expect(service.retryOrder(1)).rejects.toThrow('المسودة مُصدرة بالفعل');
    });

    it('should throw NotFoundError when order does not exist', async () => {
      (MockOrder.findByPk as jest.Mock).mockResolvedValue(null);

      await expect(service.retryOrder(999)).rejects.toThrow('الطلب غير موجود');
    });
  });
});
