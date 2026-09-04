// ──────────────────────────────────────────────────────────────────
// Mock Order Fixtures for Testing (محاكاة طلبات الشراء)
// ──────────────────────────────────────────────────────────────────
import { IncomingOrderPayload } from '../../../modules/orders/dtos/order.dtos';

export const mockZidOrderWebhook: IncomingOrderPayload = {
  storeOrderId: 'ZID-10245',
  storeType: 'ZID',
  customerName: 'د. خالد السعود',
  customerPhone: '0501234567',
  customerEmail: 'khalid@example.com',
  shippingAddress: 'الرياض - حي السليمانية - شارع الأمير عبدالعزيز بن مساعد',
  paymentMethod: 'tabby',
  items: [
    {
      sku: 'MED-MSK-01',
      barcode: '6281001070012',
      productName: 'كمامة طبية 3 طبقات (علبة 50 حبة)',
      quantity: 2,
      unitPrice: 25.0,
      discount: 5.0,
      taxPercentage: 15,
      lineTotal: 45.0,
    },
    {
      sku: 'MED-GLV-02',
      barcode: '6281001070029',
      productName: 'قفازات طبية لاتكس (علبة 100 حبة)',
      quantity: 1,
      unitPrice: 35.0,
      discount: 0,
      taxPercentage: 0,
      lineTotal: 35.0,
    },
  ],
  subtotal: 80.0,
  shippingFee: 25.0,
  discountAmount: 5.0,
  taxAmount: 6.75,
  totalAmount: 106.75,
  orderDate: '2026-09-03T14:30:00Z',
  rawOrderData: {
    id: 10245,
    status: 'completed',
    payment_method: 'tabby',
    total: 106.75,
    currency: 'SAR',
  },
};

export const mockTrendyolOrderWebhook: IncomingOrderPayload = {
  storeOrderId: 'TRN-88501',
  storeType: 'TRENDYOL',
  customerName: 'مستشفى الحبيب',
  customerPhone: '0112345678',
  customerEmail: 'orders@alhabib.sa',
  shippingAddress: 'الرياض - طريق الملك فهد - مقر المستشفى',
  paymentMethod: 'trendyol_prepaid',
  items: [
    {
      sku: 'MED-MSK-01',
      barcode: '6281001070012',
      productName: 'كمامة طبية 3 طبقات (علبة 50 حبة)',
      quantity: 10,
      unitPrice: 25.0,
      discount: 0,
      taxPercentage: 15,
      lineTotal: 250.0,
    },
  ],
  subtotal: 250.0,
  shippingFee: 0,
  discountAmount: 0,
  taxAmount: 37.5,
  totalAmount: 287.5,
  orderDate: '2026-09-03T16:00:00Z',
  rawOrderData: {
    orderNumber: '88501',
    status: 'Created',
    totalPrice: 287.5,
    currencyCode: 'SAR',
  },
};

// Mock: Daftra invoice creation response (ما ترجعه دفترة عند إنشاء مسودة فاتورة)
export const mockDaftraInvoiceCreatedResponse = {
  result: 'successful',
  code: 201,
  data: {
    Invoice: {
      id: 1025,
      number: 'INV-2026-1025',
      status: 'draft',
      total: 106.75,
      client_id: 1249,
      storehouse_id: 3,
    },
  },
};

// Mock: Webhook payload with unmapped payment method (وسيلة دفع غير معرّفة)
export const mockOrderWithUnmappedPayment: IncomingOrderPayload = {
  ...mockZidOrderWebhook,
  storeOrderId: 'ZID-99999',
  paymentMethod: 'crypto_wallet', // 🛑 وسيلة غير معرّفة
};

// Mock: Webhook payload with duplicate order (لفحص Idempotency)
export const mockDuplicateOrderWebhook: IncomingOrderPayload = {
  ...mockZidOrderWebhook,
  storeOrderId: 'ZID-10245', // 🔁 نفس الرقم — مكرر
};
