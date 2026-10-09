import { OrderService } from '../services/OrderService';
import { Order } from '../models/Order';
import { OrderItem } from '../models/OrderItem';
import { PaymentMapping } from '../models/PaymentMapping';
import { ShippingTreasuryMapping } from '../models/ShippingTreasuryMapping';
import { Product } from '../../products/models/Product';
import { ProductMapping } from '../../products/models/ProductMapping';
import { SyncLog } from '../../products/models/SyncLog';
import { daftraClient } from '../../../shared/integrations/DaftraClient';
import { zidClient } from '../../../shared/integrations/ZidClient';
import { Op } from 'sequelize';
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
jest.mock('../models/ShippingTreasuryMapping');
jest.mock('../../products/models/Product');
jest.mock('../../products/models/ProductMapping');
jest.mock('../../products/models/SyncLog');
jest.mock('../../../shared/integrations/DaftraClient');
jest.mock('../../../shared/integrations/ZidClient');

const MockOrder = Order as jest.Mocked<typeof Order>;
const MockOrderItem = OrderItem as jest.Mocked<typeof OrderItem>;
const MockPaymentMapping = PaymentMapping as jest.Mocked<typeof PaymentMapping>;
const MockShippingTreasuryMapping = ShippingTreasuryMapping as jest.Mocked<typeof ShippingTreasuryMapping>;
const MockProduct = Product as jest.Mocked<typeof Product>;
const MockProductMapping = ProductMapping as jest.Mocked<typeof ProductMapping>;
const MockSyncLog = SyncLog as jest.Mocked<typeof SyncLog>;
const MockDaftraClient = daftraClient as jest.Mocked<typeof daftraClient>;
const MockZidClient = zidClient as jest.Mocked<typeof zidClient>;

describe('OrderService Unit Tests', () => {
  let service: OrderService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new OrderService();
  });

  describe('COD settlement after Zid delivery', () => {
    const createCodOrder = () => ({
      id: 501,
      storeOrderId: 'ZID-75500001',
      storeType: 'ZID',
      paymentMethod: 'zid_cod',
      status: 'DRAFT_CREATED',
      daftraDraftInvoiceId: 9001,
      daftraInvoiceNumber: 'INV-9001',
      totalAmount: 1000,
      codSettlementStatus: 'PENDING_DELIVERY',
      codSettlementStartedAt: null,
      codSettlementMessage: null,
      codTreasuryId: null,
      treasuryId: 35,
      daftraPaymentId: null,
      shippingMethodId: null,
      shippingMethodName: null,
      zidOrderStatus: null,
      shippingStatus: null,
      shippingStatusUpdatedAt: null,
      rawOrderData: {},
      save: jest.fn().mockResolvedValue(true),
    });

    const deliveredDetails = {
      id: 75500001,
      order_status: { code: 'delivered', name: 'تم التوصيل' },
      display_status: { code: 'delivered', name: 'تم التوصيل' },
      delivered_at: '2026-09-29T10:00:00Z',
      shipping: {
        method: {
          id: 733717,
          name: 'تريك',
          order_shipping_status: null,
          tracking: { status: 'N/A' },
        },
      },
    };

    it('records one invoice payment in the carrier treasury when COD is delivered', async () => {
      const order = createCodOrder();
      (MockOrder.findOne as jest.Mock).mockResolvedValue(order);
      (MockOrder.update as jest.Mock).mockResolvedValue([1]);
      (MockOrder.findByPk as jest.Mock).mockResolvedValue(order);
      (MockZidClient.getOrderDetails as jest.Mock).mockResolvedValue({ order: deliveredDetails });
      (MockShippingTreasuryMapping.findOne as jest.Mock).mockResolvedValue({
        shippingMethodId: '733717',
        shippingMethodName: 'تريك',
        treasuryId: 33,
        treasuryName: 'تريك - cod',
        isActive: true,
      });
      (MockDaftraClient.getInvoice as jest.Mock).mockResolvedValue({
        data: {
          Invoice: {
            summary_total: 1000,
            summary_paid: 0,
            summary_unpaid: 1000,
            InvoicePayment: [],
          },
        },
      });
      (MockDaftraClient.addInvoicePayment as jest.Mock).mockResolvedValue({ id: 7001 });
      (MockSyncLog.create as jest.Mock).mockResolvedValue({});

      const result = await service.handleZidOrderStatusUpdate('75500001', deliveredDetails);

      expect(MockDaftraClient.addInvoicePayment).toHaveBeenCalledWith(
        expect.objectContaining({
          invoice_id: 9001,
          amount: 1000,
          treasury_id: 33,
          transaction_id: 'COD-ZID-75500001',
        })
      );
      expect(result?.codSettlementStatus).toBe('SETTLED');
      expect(result?.codTreasuryId).toBe(33);
      expect(result?.treasuryId).toBe(33);
      expect(result?.shippingStatus).toBe('تم التوصيل');
    });

    it('links an existing matching Daftra payment without creating a duplicate', async () => {
      const order = createCodOrder();
      (MockOrder.findOne as jest.Mock).mockResolvedValue(order);
      (MockOrder.update as jest.Mock).mockResolvedValue([1]);
      (MockOrder.findByPk as jest.Mock).mockResolvedValue(order);
      (MockZidClient.getOrderDetails as jest.Mock).mockResolvedValue({ order: deliveredDetails });
      (MockShippingTreasuryMapping.findOne as jest.Mock).mockResolvedValue({
        shippingMethodId: '733717',
        shippingMethodName: 'تريك',
        treasuryId: 33,
        treasuryName: 'تريك - cod',
        isActive: true,
      });
      (MockDaftraClient.getInvoice as jest.Mock).mockResolvedValue({
        data: {
          Invoice: {
            summary_total: 1000,
            summary_paid: 1000,
            summary_unpaid: 0,
            InvoicePayment: [{ id: 7002, transaction_id: 'COD-ZID-75500001' }],
          },
        },
      });

      const result = await service.handleZidOrderStatusUpdate('75500001', deliveredDetails);

      expect(MockDaftraClient.addInvoicePayment).not.toHaveBeenCalled();
      expect(result?.codSettlementStatus).toBe('SETTLED');
      expect(result?.daftraPaymentId).toBe('7002');
    });

    it('requires review and does not use the generic COD treasury for an unmapped carrier', async () => {
      const order = createCodOrder();
      const unknownCarrier = {
        ...deliveredDetails,
        shipping: { method: { id: 999999, name: 'شركة جديدة', order_shipping_status: 'تم التوصيل' } },
      };
      (MockOrder.findOne as jest.Mock).mockResolvedValue(order);
      (MockOrder.update as jest.Mock).mockResolvedValue([1]);
      (MockOrder.findByPk as jest.Mock).mockResolvedValue(order);
      (MockZidClient.getOrderDetails as jest.Mock).mockResolvedValue({ order: unknownCarrier });
      (MockShippingTreasuryMapping.findOne as jest.Mock).mockResolvedValue(null);
      (MockShippingTreasuryMapping.findAll as jest.Mock).mockResolvedValue([]);

      const result = await service.handleZidOrderStatusUpdate('75500001', unknownCarrier);

      expect(MockDaftraClient.addInvoicePayment).not.toHaveBeenCalled();
      expect(result?.codSettlementStatus).toBe('REVIEW_REQUIRED');
      expect(result?.codSettlementMessage).toContain('شركة جديدة');
    });
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
      expect(sentPayload.Invoice.is_draft).toBe(0);
      expect(sentPayload.Invoice.draft).toBe(0);
      expect(sentPayload.Invoice.storehouse_id).toBe(3);
      expect(result.treasuryId).toBe(19);
    });

    it.each([
      { label: 'a cancellation timestamp', status: 'PROCESSING', cancelledAt: new Date() },
      { label: 'a cancellation status', status: 'CANCEL_FAILED', cancelledAt: null },
    ])('should stop before calling Daftra when reload observes $label', async ({ status, cancelledAt }) => {
      (MockOrder.findOne as jest.Mock).mockResolvedValue(null);

      const createdOrder: any = {
        id: 6,
        storeOrderId: 'ZID-10245',
        storeType: 'ZID',
        paymentMethod: 'tabby',
        status: 'PROCESSING',
        cancelledAt: null,
        treasuryId: null,
        save: jest.fn().mockResolvedValue(true),
        reload: jest.fn().mockImplementation(async () => {
          createdOrder.status = status;
          createdOrder.cancelledAt = cancelledAt;
          createdOrder.treasuryId = null;
          return createdOrder;
        }),
      };
      (MockOrder.create as jest.Mock).mockResolvedValue(createdOrder);
      (MockProductMapping.findOne as jest.Mock).mockResolvedValue({ daftraProductId: 1359 });
      (MockOrderItem.create as jest.Mock).mockResolvedValue({});
      (MockOrderItem.findAll as jest.Mock).mockResolvedValue([
        { id: 1, orderId: 6, sku: 'MED-MSK-01', daftraProductId: 1359, matchStatus: 'MATCHED' },
      ]);
      (MockPaymentMapping.findOne as jest.Mock).mockResolvedValue({
        paymentMethodKey: 'tabby',
        treasuryId: 19,
        treasuryName: 'tabby',
        paymentMethodLabel: 'تابي',
        isActive: true,
      });

      const result = await service.handleIncomingOrder({
        ...mockZidOrderWebhook,
        items: [mockZidOrderWebhook.items[0]],
      });

      expect(result).toBe(createdOrder);
      expect(createdOrder.reload).toHaveBeenCalledTimes(1);
      expect(MockDaftraClient.createInvoice).not.toHaveBeenCalled();
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
      expect(result.treasuryId).toBe(25);
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

      await expect(service.retryOrder(1)).rejects.toThrow('الفاتورة مُصدرة بالفعل');
    });

    it('should throw NotFoundError when order does not exist', async () => {
      (MockOrder.findByPk as jest.Mock).mockResolvedValue(null);

      await expect(service.retryOrder(999)).rejects.toThrow('الطلب غير موجود');
    });
  });

  describe('handleZidOrderCancellation() — Full cancellation before shipping', () => {
    const cancelledZidOrder = {
      order: {
        id: 10245,
        order_status: { code: 'cancelled', name: 'ملغي' },
        display_status: { code: 'cancelled' },
        customer: { name: 'عميل زد', mobile: '0500000000' },
        order_total: 106.75,
        shipping: { method: { order_shipping_status: null } },
        histories: [
          { order_status_name: 'ملغي', comment: 'طلب العميل الإلغاء' },
          { order_status_name: 'جديد' },
        ],
        delivered_at: null,
      },
    };

    beforeEach(() => {
      (MockZidClient.getOrderDetails as jest.Mock).mockResolvedValue(cancelledZidOrder);
      (MockSyncLog.create as jest.Mock).mockResolvedValue({});
      (MockDaftraClient.getInvoice as jest.Mock).mockResolvedValue({
        data: {
          Invoice: {
            id: 7001,
            client_id: 3964,
            InvoiceItem: [
              {
                product_id: 1359,
                item: 'منتج طبي',
                description: 'منتج طبي',
                unit_price: 75,
                quantity: 1,
                discount: 0,
                tax1: 7,
                sales_account_id: 4689,
              },
            ],
          },
        },
      });
    });

    it('marks an order cancelled without calling Daftra when no invoice exists', async () => {
      const order: any = {
        id: 10,
        storeOrderId: 'ZID-10245',
        storeType: 'ZID',
        status: 'PROCESSING',
        daftraDraftInvoiceId: null,
        daftraInvoiceNumber: null,
        daftraRefundReceiptId: null,
        cancelledAt: null,
        save: jest.fn().mockResolvedValue(true),
      };
      (MockOrder.findOne as jest.Mock).mockResolvedValue(order);

      const result = await service.handleZidOrderCancellation('10245', { payload: { id: 10245 } });

      expect(result.status).toBe('CANCELLED');
      expect(result.statusMessage).toContain('قبل إصدار فاتورة');
      expect(MockDaftraClient.createRefundReceipt).not.toHaveBeenCalled();
    });

    it('creates one full Daftra refund receipt linked to the source invoice without a Payment block', async () => {
      const order: any = {
        id: 11,
        storeOrderId: 'ZID-10245',
        storeType: 'ZID',
        status: 'DRAFT_CREATED',
        daftraDraftInvoiceId: 7001,
        daftraInvoiceNumber: 'INV-7001',
        daftraRefundReceiptId: null,
        daftraRefundReceiptNumber: null,
        cancellationReason: null,
        cancelledAt: null,
        shippingFee: 25,
        discountAmount: 5,
        taxAmount: 10,
        rawOrderData: {},
        save: jest.fn().mockResolvedValue(true),
      };
      (MockOrder.findOne as jest.Mock).mockResolvedValue(order);
      (MockOrderItem.findAll as jest.Mock).mockResolvedValue([
        {
          orderId: 11,
          productName: 'منتج طبي',
          daftraProductId: 1359,
          unitPrice: 75,
          quantity: 1,
          discount: 0,
          taxPercentage: 15,
        },
      ]);
      (MockDaftraClient.findRefundReceiptByInvoice as jest.Mock).mockResolvedValue(null);
      (MockDaftraClient.createRefundReceipt as jest.Mock).mockResolvedValue({
        id: 9001,
        invoice_number: 'RR-9001',
      });

      const result = await service.handleZidOrderCancellation('10245', { payload: { id: 10245 } });

      expect(result.status).toBe('CANCELLED');
      expect(result.daftraRefundReceiptId).toBe(9001);
      expect(result.daftraRefundReceiptNumber).toBe('RR-9001');
      expect(MockDaftraClient.createRefundReceipt).toHaveBeenCalledTimes(1);
      const payload = (MockDaftraClient.createRefundReceipt as jest.Mock).mock.calls[0][0];
      expect(payload.Invoice.subscription_id).toBe(7001);
      expect(payload.Invoice.client_id).toBe(3964);
      expect(payload.InvoiceItem).toHaveLength(1);
      expect(payload.Payment).toBeUndefined();
    });

    it('coalesces concurrent duplicate cancellation webhooks into one Daftra return request', async () => {
      const order: any = {
        id: 14,
        storeOrderId: 'ZID-10245',
        storeType: 'ZID',
        status: 'DRAFT_CREATED',
        daftraDraftInvoiceId: 7001,
        daftraInvoiceNumber: 'INV-7001',
        daftraRefundReceiptId: null,
        cancelledAt: null,
        shippingFee: 0,
        discountAmount: 0,
        taxAmount: 10,
        rawOrderData: {},
        save: jest.fn().mockResolvedValue(true),
      };
      (MockOrder.findOne as jest.Mock).mockResolvedValue(order);
      (MockDaftraClient.findRefundReceiptByInvoice as jest.Mock).mockResolvedValue(null);
      (MockDaftraClient.createRefundReceipt as jest.Mock).mockResolvedValue({
        id: 9002,
        invoice_number: 'RR-9002',
      });

      const [first, second] = await Promise.all([
        service.handleZidOrderCancellation('10245', {}),
        service.handleZidOrderCancellation('10245', {}),
      ]);

      expect(first.daftraRefundReceiptId).toBe(9002);
      expect(second.daftraRefundReceiptId).toBe(9002);
      expect(MockDaftraClient.createRefundReceipt).toHaveBeenCalledTimes(1);
    });

    it('reuses an existing Daftra refund receipt instead of creating a duplicate', async () => {
      const order: any = {
        id: 12,
        storeOrderId: 'ZID-10245',
        storeType: 'ZID',
        status: 'CANCEL_FAILED',
        daftraDraftInvoiceId: 7001,
        daftraRefundReceiptId: null,
        cancelledAt: new Date(),
        save: jest.fn().mockResolvedValue(true),
      };
      (MockOrder.findOne as jest.Mock).mockResolvedValue(order);
      (MockDaftraClient.findRefundReceiptByInvoice as jest.Mock).mockResolvedValue({
        id: 9001,
        no: 'RR-9001',
        subscription_id: 7001,
      });

      const result = await service.handleZidOrderCancellation('10245', {});

      expect(result.status).toBe('CANCELLED');
      expect(result.daftraRefundReceiptId).toBe(9001);
      expect(MockDaftraClient.createRefundReceipt).not.toHaveBeenCalled();
    });

    it('creates a full return for a cancelled order even after shipping or delivery', async () => {
      (MockZidClient.getOrderDetails as jest.Mock).mockResolvedValue({
        order: {
          ...cancelledZidOrder.order,
          delivered_at: '2026-09-20T10:00:00Z',
          histories: [{ order_status_name: 'تم التوصيل' }, { order_status_name: 'ملغي' }],
        },
      });
      const order: any = {
        id: 13,
        storeOrderId: 'ZID-10245',
        storeType: 'ZID',
        status: 'DRAFT_CREATED',
        daftraDraftInvoiceId: 7001,
        daftraInvoiceNumber: 'INV-7001',
        daftraRefundReceiptId: null,
        daftraRefundReceiptNumber: null,
        cancelledAt: null,
        shippingFee: 0,
        discountAmount: 0,
        taxAmount: 10,
        rawOrderData: {},
        save: jest.fn().mockResolvedValue(true),
      };
      (MockOrder.findOne as jest.Mock).mockResolvedValue(order);
      (MockDaftraClient.findRefundReceiptByInvoice as jest.Mock).mockResolvedValue(null);
      (MockDaftraClient.createRefundReceipt as jest.Mock).mockResolvedValue({
        id: 9003,
        invoice_number: 'RR-9003',
      });

      const result = await service.handleZidOrderCancellation('10245', {});

      expect(result.status).toBe('CANCELLED');
      expect(result.daftraRefundReceiptId).toBe(9003);
      expect(MockDaftraClient.findRefundReceiptByInvoice).toHaveBeenCalledWith(7001, 'ZID-10245');
      expect(MockDaftraClient.createRefundReceipt).toHaveBeenCalledTimes(1);
    });
  });

  describe('getOrders() — Stalled cancellation detection', () => {
    it('includes CANCEL_PENDING orders only after five minutes in the stalled filter', async () => {
      (MockOrder.findAndCountAll as jest.Mock).mockResolvedValue({ rows: [], count: 0 });
      const startedAt = Date.now();

      await service.getOrders({ status: 'STALLED' });

      const query = (MockOrder.findAndCountAll as jest.Mock).mock.calls[0][0];
      const clauses = query.where[Op.or];
      expect(clauses).toHaveLength(4);
      expect(clauses[1].status).toBe('CANCEL_PENDING');
      const cutoff = clauses[1].updatedAt[Op.lt] as Date;
      expect(cutoff).toBeInstanceOf(Date);
      expect(cutoff.getTime()).toBeGreaterThanOrEqual(startedAt - (5 * 60 * 1000) - 1000);
      expect(cutoff.getTime()).toBeLessThanOrEqual(Date.now() - (5 * 60 * 1000));
      expect(clauses[2].codSettlementStatus[Op.in]).toEqual(['FAILED', 'REVIEW_REQUIRED']);
      expect(clauses[3].codSettlementStatus).toBe('PROCESSING');
    });
  });
});
