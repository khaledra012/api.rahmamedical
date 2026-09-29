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
  | 'SKIPPED'           // تم تجاهل الطلب (مكرر)
  | 'CANCEL_PENDING'    // وصل إلغاء زد وجارٍ عكس الفاتورة
  | 'CANCELLED'         // تم إلغاء الطلب وعكس فاتورته إن وجدت
  | 'CANCEL_FAILED'     // فشل إنشاء مرتجع دفترة
  | 'CANCEL_REVIEW_REQUIRED'; // الطلب خرج للشحن ويحتاج مراجعة يدوية

export type StoreType = 'ZID' | 'TRENDYOL';

export type CodSettlementStatus =
  | 'NOT_APPLICABLE'
  | 'PENDING_DELIVERY'
  | 'PROCESSING'
  | 'SETTLED'
  | 'FAILED'
  | 'REVIEW_REQUIRED';

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
  shippingMethodId?: string | null;
  shippingMethodName?: string | null;
  zidOrderStatus?: string | null;
  shippingStatus?: string | null;
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
  cancelledOrders: number;
  cancellationReviewOrders: number;
  codSettlementIssueOrders: number;
  recentLogs: object[];
}

export interface DaftraRefundReceiptPayload {
  Invoice: {
    subscription_id: number;
    client_id: number;
    date: string;
    storehouse_id: number;
    draft: number;
    is_draft: number;
    notes: string;
    discount?: number;
    discount_type?: number;
    shipping_options?: string;
    shipping_amount?: number;
    shipping_tax_id?: number;
  };
  InvoiceItem: Array<DaftraInvoicePayload['InvoiceItem'][number] & { discount_type?: number }>;
}

export interface DaftraInvoicePayload {
  Invoice: {
    client_id: number;
    client_business_name?: string;
    client_first_name?: string;
    client_last_name?: string;
    client_phone1?: string;
    client_email?: string;
    client_address1?: string;
    client_city?: string;
    client_country_code?: string;
    storehouse_id: number;
    draft?: number;
    is_draft: number;
    notes: string;
    date?: string;
    discount?: number;
    discount_type?: number;
    shipping_options?: string;
    shipping_amount?: number;
    shipping_tax_id?: number;
    shipping_option_id?: number | null;
  };
  InvoiceItem: Array<{
    product_id?: number;
    item_id?: number;
    item?: string;
    item_name?: string;
    description?: string;
    unit_price: number;
    quantity: number;
    discount?: number;
    tax1?: number;
    exemption_reason_code?: string;
    exemption_reason?: string;
    account_id: number;
  }>;
  Payment?: Array<{
    treasury_id: number;
    paid_amount: number;
    payment_method?: string;
  }>;
}
