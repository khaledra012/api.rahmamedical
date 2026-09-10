// ──────────────────────────────────────────────────────────────────
// Order DTOs and Type Definitions
// ──────────────────────────────────────────────────────────────────

export type OrderStatus =
  | 'PENDING_INVOICE'   // وصل الطلب وجاهز للفوترة
  | 'PROCESSING'        // جاري تجهيز المسودة (قفل المعالجة)
  | 'DRAFT_CREATED'     // مسودة الفاتورة تم إصدارها في دفترة
  | 'UNMAPPED_PAYMENT'  // وسيلة دفع غير معرّفة (إيقاف فوري)
  | 'UNMAPPED_PRODUCT'  // صنف غير مطابق في دفترة
  | 'FAILED'            // فشل الاتصال بدفترة أو خطأ تقني
  | 'SKIPPED';          // تم تجاهل الطلب (مكرر أو ملغي)

export type StoreType = 'ZID' | 'TRENDYOL';

export type PaymentMethodKey =
  | 'tabby'
  | 'tamara'
  | 'zidpay'
  | 'mada'
  | 'visa'
  | 'mastercard'
  | 'applepay'
  | 'stcpay'
  | 'cod'
  | 'trendyol_prepaid'
  | 'bank_transfer';

export interface OrderItemDTO {
  sku: string;
  barcode?: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  taxPercentage: number;
  lineTotal: number;
  daftraProductId?: number;
}

export interface IncomingOrderPayload {
  storeOrderId: string;
  storeType: StoreType;
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  shippingAddress?: string | null;
  paymentMethod: string;
  items: OrderItemDTO[];
  subtotal: number;
  shippingFee: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  orderDate: string;
  rawOrderData: object;
}

export interface OrderFilterParams {
  status?: OrderStatus | 'STALLED';
  storeType?: StoreType;
  page?: number;
  limit?: number;
  search?: string;
}

export interface OrderStatsDTO {
  totalOrders: number;
  draftCreatedOrders: number;
  pendingOrders: number;
  failedOrders: number;
  unmappedPaymentOrders: number;
  unmappedProductOrders: number;
  stalledOrders: number;
  recentLogs: object[];
}

export interface DaftraInvoicePayload {
  Invoice: {
    client_id: number;
    client_email?: string;
    storehouse_id: number;
    draft?: number;
    is_draft: number;
    notes: string;
    date?: string;
    discount?: number;
    discount_type?: number;
  };
  InvoiceItem: Array<{
    item_id?: number;
    item_name?: string;
    description?: string;
    unit_price: number;
    quantity: number;
    discount?: number;
    tax1?: number;
    account_id: number;
  }>;
  Payment?: Array<{
    treasury_id: number;
    paid_amount: number;
    payment_method?: string;
  }>;
}
