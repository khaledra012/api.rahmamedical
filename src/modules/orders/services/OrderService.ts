import { Op } from 'sequelize';
import { Order } from '../models/Order';
import { OrderItem } from '../models/OrderItem';
import { PaymentMapping } from '../models/PaymentMapping';
import { ShippingTreasuryMapping } from '../models/ShippingTreasuryMapping';
import { Product } from '../../products/models/Product';
import { ProductMapping } from '../../products/models/ProductMapping';
import { SyncLog } from '../../products/models/SyncLog';
import { daftraClient } from '../../../shared/integrations/DaftraClient';
import { zidClient } from '../../../shared/integrations/ZidClient';
import { env } from '../../../config/env';
import {
  logger,
  extractAddressDetails,
  formatZatcaPhone,
  sanitizeEmail,
  isInternationalCountry,
} from '../../../shared/helpers';

import { NotFoundError, ConflictError } from '../../../shared/errors';
import {
  IncomingOrderPayload,
  OrderStatus,
  DaftraInvoicePayload,
  OrderStatsDTO,
  OrderFilterParams,
  DaftraRefundReceiptPayload,
} from '../dtos/order.dtos';

const CANCEL_PENDING_STALE_MS = 5 * 60 * 1000;
const COD_SETTLEMENT_STALE_MS = 5 * 60 * 1000;
const COD_PAYMENT_METHODS = ['cod', 'cash_on_delivery', 'zid_cod', 'zid_cop'];

const normalizeText = (value: unknown): string =>
  String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();

const isCodPaymentMethod = (value: unknown): boolean =>
  COD_PAYMENT_METHODS.includes(normalizeText(value));

export class OrderService {
  private readonly cancellationRequests = new Map<string, Promise<Order>>();
  private readonly codSettlementRequests = new Map<number, Promise<Order>>();

  // ──────────────────────────────────────────────────────────────
  // 1. استقبال الطلب مع حماية التكرار (Idempotent Ingestion)
  // ──────────────────────────────────────────────────────────────
  async handleIncomingOrder(payload: IncomingOrderPayload): Promise<Order> {
    // Idempotency Guard: فحص هل الطلب مسجل مسبقاً
    const existingOrder = await Order.findOne({
      where: { storeOrderId: payload.storeOrderId },
    });

    if (existingOrder) {
      logger.info(`[OrderService] Order ${payload.storeOrderId} already exists (ID: ${existingOrder.id}). Skipping.`);
      return existingOrder;
    }

    // Processing Lock: تثبيت حالة PROCESSING لمنع التكرار المتزامن
    const order = await Order.create({
      storeOrderId: payload.storeOrderId,
      storeType: payload.storeType,
      customerName: payload.customerName,
      customerPhone: payload.customerPhone,
      customerEmail: payload.customerEmail || null,
      shippingAddress: payload.shippingAddress || null,
      paymentMethod: payload.paymentMethod,
      shippingMethodId: payload.shippingMethodId || null,
      shippingMethodName: payload.shippingMethodName || null,
      zidOrderStatus: payload.zidOrderStatus || null,
      shippingStatus: payload.shippingStatus || payload.zidOrderStatus || null,
      shippingStatusUpdatedAt: payload.zidOrderStatus || payload.shippingStatus ? new Date() : null,
      codSettlementStatus: isCodPaymentMethod(payload.paymentMethod)
        ? 'PENDING_DELIVERY'
        : 'NOT_APPLICABLE',
      subtotal: payload.subtotal,
      shippingFee: payload.shippingFee,
      discountAmount: payload.discountAmount,
      taxAmount: payload.taxAmount,
      totalAmount: payload.totalAmount,
      orderDate: payload.orderDate ? new Date(payload.orderDate) : new Date(),
      rawOrderData: payload.rawOrderData,
      status: 'PROCESSING',
    });

    // حفظ بنود الطلب مع المطابقة الثلاثية (Triple Fallback Matching)
    for (const item of payload.items) {
      const matchedProduct = await this.matchProductToDaftra(item.sku, item.barcode);

      await OrderItem.create({
        orderId: order.id,
        sku: item.sku,
        barcode: item.barcode || null,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discount: item.discount || 0,
        taxPercentage: item.taxPercentage !== undefined && item.taxPercentage !== null ? item.taxPercentage : 15,
        lineTotal: item.lineTotal,
        daftraProductId: matchedProduct?.daftraProductId || null,
        matchStatus: matchedProduct ? 'MATCHED' : 'UNMATCHED',
      });
    }

    logger.info(`[OrderService] Ingested order ${payload.storeOrderId} (${payload.storeType}) — ID: ${order.id}`);

    // التحقق من صلاحية وسيلة الدفع (Circuit Breaker)
    const paymentMapping = await this.resolvePaymentTreasury(payload.paymentMethod);

    if (!paymentMapping) {
      order.status = 'UNMAPPED_PAYMENT';
      order.statusMessage = `وسيلة دفع غير معرّفة: "${payload.paymentMethod}". يرجى تحديد خزينتها في جدول المطابقة.`;
      await order.save();
      logger.warn(`[OrderService] HALTED order ${order.storeOrderId}: unmapped payment method "${payload.paymentMethod}"`);
      return order;
    }

    order.treasuryId = paymentMapping.treasuryId;

    // التحقق من مطابقة جميع الأصناف
    const orderItems = await OrderItem.findAll({ where: { orderId: order.id } });
    const unmatchedItems = orderItems.filter((oi) => oi.matchStatus === 'UNMATCHED');

    if (unmatchedItems.length > 0) {
      const unmatchedSkus = unmatchedItems.map((oi) => oi.sku).join(', ');
      order.status = 'UNMAPPED_PRODUCT';
      order.statusMessage = `أصناف غير مطابقة في دفترة: [${unmatchedSkus}]. يرجى ربطها بالأصناف الصحيحة.`;
      await order.save();
      logger.warn(`[OrderService] HALTED order ${order.storeOrderId}: unmatched SKUs: ${unmatchedSkus}`);
      return order;
    }

    // قد يصل إلغاء زد أثناء مطابقة البنود؛ أعد قراءة السجل قبل أي كتابة مالية خارجية.
    if (typeof (order as any).reload === 'function') {
      await order.reload();
      if (order.cancelledAt || order.status.startsWith('CANCEL')) {
        return order;
      }
    }

    // تجهيز وإرسال الفاتورة لدفترة (معتمدة ومباشرة)
    try {
      const invoiceResult = await this.createDraftInvoice(order, orderItems, paymentMapping);
      const paymentRecorded = await this.recordInvoicePayment(invoiceResult.invoiceId, order, paymentMapping);

      order.status = 'DRAFT_CREATED';
      order.treasuryId = paymentMapping.treasuryId;
      order.daftraDraftInvoiceId = invoiceResult.invoiceId;
      order.daftraInvoiceNumber = invoiceResult.invoiceNumber;
      order.statusMessage = paymentRecorded
        ? `الفاتورة ${invoiceResult.invoiceNumber} تم إصدارها معتمدة ومسددة في خزينة (${paymentMapping.treasuryName || paymentMapping.paymentMethodLabel}) بنجاح.`
        : `الفاتورة ${invoiceResult.invoiceNumber} تم إصدارها معتمدة في دفترة (غير مسددة).`;
      await order.save();

      // يغطي سباقاً نادراً: وصل الإلغاء بينما كان طلب إنشاء الفاتورة قيد التنفيذ.
      if (typeof (order as any).reload === 'function') {
        await order.reload();
        if (order.cancelledAt) {
          return await this.handleZidOrderCancellation(
            order.storeOrderId.replace(/^ZID-/i, ''),
            order.rawOrderData
          );
        }
      }

      // توثيق العملية في سجل المعاملات
      await SyncLog.create({
        entityType: 'ORDER',
        entityId: order.id,
        action: 'CREATE',
        direction: order.storeType === 'ZID' ? 'ZID_TO_DAFTRA' : 'TRENDYOL_TO_DAFTRA',
        source: 'WEBHOOK',
        requestUrl: `${env.daftra.baseUrl}/invoices.json`,
        requestMethod: 'POST',
        status: 'SUCCESS',
      });

      logger.info(
        `[OrderService] Invoice ${invoiceResult.invoiceNumber} created for order ${order.storeOrderId} (Payment recorded: ${paymentRecorded})`
      );
    } catch (error: any) {
      order.status = 'FAILED';
      order.statusMessage = `فشل إنشاء الفاتورة في دفترة: ${error.message}`;
      await order.save();

      await SyncLog.create({
        entityType: 'ORDER',
        entityId: order.id,
        action: 'CREATE',
        direction: order.storeType === 'ZID' ? 'ZID_TO_DAFTRA' : 'TRENDYOL_TO_DAFTRA',
        source: 'WEBHOOK',
        requestUrl: `${env.daftra.baseUrl}/invoices.json`,
        requestMethod: 'POST',
        status: 'FAILED',
        errorMessage: error.message,
      });

      logger.error(`[OrderService] Failed to create draft invoice for order ${order.storeOrderId}: ${error.message}`);
    }

    return order;
  }

  // ──────────────────────────────────────────────────────────────
  // 1.B إلغاء طلب زد بالكامل وإنشاء مرتجع عند وجود فاتورة، بغض النظر عن حالة الشحن
  // ──────────────────────────────────────────────────────────────
  async handleZidOrderCancellation(zidOrderId: string, webhookPayload: any): Promise<Order> {
    const cleanZidOrderId = String(zidOrderId).replace(/^ZID-/i, '');
    const storeOrderId = `ZID-${cleanZidOrderId}`;

    const activeRequest = this.cancellationRequests.get(storeOrderId);
    if (activeRequest) {
      return activeRequest;
    }

    const request = this.processZidOrderCancellation(cleanZidOrderId, storeOrderId, webhookPayload);
    this.cancellationRequests.set(storeOrderId, request);
    try {
      return await request;
    } finally {
      if (this.cancellationRequests.get(storeOrderId) === request) {
        this.cancellationRequests.delete(storeOrderId);
      }
    }
  }

  private async processZidOrderCancellation(
    cleanZidOrderId: string,
    storeOrderId: string,
    webhookPayload: any
  ): Promise<Order> {

    let detailsResponse: any;
    try {
      detailsResponse = await zidClient.getOrderDetails(cleanZidOrderId);
    } catch (error: any) {
      logger.error(`[OrderCancellation] Could not verify Zid order ${storeOrderId}: ${error.message}`);
      throw error;
    }

    const details = detailsResponse?.order || detailsResponse?.data?.order || detailsResponse?.data || detailsResponse;
    const currentZidStatus = String(
      details?.order_status?.code || details?.display_status?.code || details?.status?.code || ''
    ).toLowerCase();

    if (!['cancelled', 'canceled'].includes(currentZidStatus)) {
      throw new ConflictError(`طلب زد ${storeOrderId} ليس في حالة ملغي حالياً`);
    }

    let order = await Order.findOne({ where: { storeOrderId } });
    const cancellationReason = this.extractCancellationReason(webhookPayload, details);

    // لو وصل إشعار الإلغاء قبل إشعار الإنشاء نحفظ طلباً ملغياً مختصراً.
    // وصول order.create لاحقاً سيتوقف عند صمام منع التكرار ولن يصدر فاتورة.
    if (!order) {
      order = await Order.create({
        storeOrderId,
        storeType: 'ZID',
        customerName:
          details?.customer?.name ||
          [details?.customer?.first_name, details?.customer?.last_name].filter(Boolean).join(' ') ||
          'عميل زد',
        customerPhone: details?.customer?.mobile || details?.customer?.phone || '',
        customerEmail: details?.customer?.email || null,
        shippingAddress: null,
        paymentMethod: String(
          details?.payment?.method?.code || details?.payment_method?.code || details?.payment_status || 'unknown'
        ).toLowerCase(),
        subtotal: this.toNumber(details?.products_sum_total || details?.sub_total || 0),
        shippingFee: this.toNumber(details?.shipping?.cost || details?.shipping_cost || 0),
        discountAmount: this.toNumber(details?.discount || details?.discount_amount || 0),
        taxAmount: this.toNumber(details?.tax_amount || details?.tax || 0),
        totalAmount: this.toNumber(details?.order_total || details?.total || 0),
        status: 'CANCEL_PENDING',
        statusMessage: 'وصل إلغاء الطلب من زد قبل إصدار فاتورة في دفترة.',
        cancellationReason,
        cancelledAt: new Date(),
        orderDate: details?.created_at ? new Date(details.created_at) : new Date(),
        rawOrderData: webhookPayload || details || {},
      });
    }

    if (order.status === 'CANCELLED' && order.daftraRefundReceiptId) {
      return order;
    }
    if (order.status === 'CANCELLED' && !order.daftraDraftInvoiceId) {
      return order;
    }

    order.cancellationReason = cancellationReason;
    order.cancelledAt = order.cancelledAt || new Date();
    order.zidOrderStatus = 'cancelled';
    order.shippingStatus = 'ملغي';
    order.shippingStatusUpdatedAt = new Date();

    order.status = 'CANCEL_PENDING';
    order.statusMessage = 'تم استلام الإلغاء من زد وجارٍ عكس الفاتورة في دفترة.';
    await order.save();

    // لم تُصدر فاتورة بعد: يكفي منع فوترة الطلب مستقبلاً.
    if (!order.daftraDraftInvoiceId) {
      if (order.daftraInvoiceNumber) {
        order.status = 'CANCEL_REVIEW_REQUIRED';
        order.statusMessage = 'يوجد رقم فاتورة محفوظ بدون معرف دفترة؛ يلزم التحقق اليدوي قبل إنشاء مرتجع.';
      } else {
        order.status = 'CANCELLED';
        order.statusMessage = 'تم إلغاء الطلب قبل إصدار فاتورة في دفترة.';
      }
      await order.save();
      return order;
    }

    try {
      const existingReceipt = await daftraClient.findRefundReceiptByInvoice(
        order.daftraDraftInvoiceId,
        storeOrderId
      );

      if (existingReceipt) {
        order.daftraRefundReceiptId = Number(existingReceipt.id);
        order.daftraRefundReceiptNumber = String(
          existingReceipt.no || existingReceipt.invoice_number || `RR-${existingReceipt.id}`
        );
        order.status = 'CANCELLED';
        order.statusMessage = `تم ربط مرتجع دفترة الموجود مسبقاً رقم ${order.daftraRefundReceiptNumber}.`;
        await order.save();
        return order;
      }

      const sourceResponse: any = await daftraClient.getInvoice(order.daftraDraftInvoiceId);
      const sourceInvoice: any =
        sourceResponse?.data?.Invoice || sourceResponse?.Invoice || sourceResponse?.data || sourceResponse;
      const sourceItems: any[] = Array.isArray(sourceInvoice?.InvoiceItem)
        ? sourceInvoice.InvoiceItem
        : [];
      if (!sourceInvoice?.client_id || sourceItems.length === 0) {
        order.status = 'CANCEL_REVIEW_REQUIRED';
        order.statusMessage = 'تعذر قراءة العميل أو بنود الفاتورة الأصلية من دفترة لبناء مرتجع كامل.';
        await order.save();
        return order;
      }

      const refundPayload = this.buildFullRefundReceiptPayload(order, sourceInvoice, sourceItems);
      const response: any = await daftraClient.createRefundReceipt(refundPayload);
      const receiptId = Number(
        response?.id || response?.data?.RefundReceipt?.id || response?.data?.Invoice?.id || response?.data?.id || 0
      );
      if (!receiptId) {
        throw new Error('دفترة قبلت إنشاء المرتجع لكنها لم تُرجع معرف المستند');
      }

      order.daftraRefundReceiptId = receiptId;
      order.daftraRefundReceiptNumber = String(
        response?.invoice_number ||
        response?.data?.RefundReceipt?.no ||
        response?.data?.Invoice?.number ||
        `RR-${receiptId}`
      );
      order.status = 'CANCELLED';
      order.statusMessage = `تم إلغاء الطلب وإنشاء مرتجع دفترة كامل رقم ${order.daftraRefundReceiptNumber}.`;
      await order.save();

      await SyncLog.create({
        entityType: 'ORDER',
        entityId: order.id,
        action: 'CREATE',
        direction: 'ZID_TO_DAFTRA',
        source: 'WEBHOOK',
        requestUrl: `${env.daftra.baseUrl}/refund_receipts.json`,
        requestMethod: 'POST',
        requestPayload: { sourceInvoiceId: order.daftraDraftInvoiceId, storeOrderId },
        responseStatus: 202,
        responseBody: { refundReceiptId: receiptId, refundReceiptNumber: order.daftraRefundReceiptNumber },
        status: 'SUCCESS',
      });

      logger.info(
        `[OrderCancellation] Created Daftra refund receipt ${order.daftraRefundReceiptNumber} for ${storeOrderId}.`
      );
      return order;
    } catch (error: any) {
      order.status = 'CANCEL_FAILED';
      order.statusMessage = `فشل إنشاء مرتجع دفترة: ${error.message}`;
      await order.save();

      await SyncLog.create({
        entityType: 'ORDER',
        entityId: order.id,
        action: 'CREATE',
        direction: 'ZID_TO_DAFTRA',
        source: 'WEBHOOK',
        requestUrl: `${env.daftra.baseUrl}/refund_receipts.json`,
        requestMethod: 'POST',
        requestPayload: { sourceInvoiceId: order.daftraDraftInvoiceId, storeOrderId },
        status: 'FAILED',
        errorMessage: error.message,
      });
      throw error;
    }
  }

  private buildFullRefundReceiptPayload(
    order: Order,
    sourceInvoice: any,
    sourceItems: any[]
  ): DaftraRefundReceiptPayload {
    const rawWrapper: any = order.rawOrderData || {};
    const rawData: any = rawWrapper?.payload || rawWrapper?.order || rawWrapper?.data || rawWrapper;
    const addressInfo = extractAddressDetails(rawData.shipping, rawData.shipping_address);
    const isInternational = isInternationalCountry(addressInfo.countryCode);
    const revenueAccountId = env.daftra.zidRevenueAccountId;

    return {
      Invoice: {
        subscription_id: order.daftraDraftInvoiceId!,
        client_id: Number(sourceInvoice.client_id),
        date: new Date().toISOString().split('T')[0],
        storehouse_id: env.daftra.storehouseId,
        draft: 0,
        is_draft: 0,
        notes: `إلغاء كامل لطلب زد ${order.storeOrderId} | ZID-CANCEL-${order.storeOrderId}`,
        ...(order.shippingFee > 0
          ? {
              shipping_options: '1',
              shipping_amount: Number(order.shippingFee),
              shipping_tax_id: isInternational || order.taxAmount === 0 ? 0 : env.daftra.vat15InclusiveTaxId,
            }
          : {}),
        ...(order.discountAmount > 0
          ? { discount: Number(order.discountAmount), discount_type: 1 }
          : {}),
      },
      InvoiceItem: sourceItems.map((item) => ({
        product_id: Number(item.product_id) || undefined,
        item_id: Number(item.product_id) || undefined,
        item: String(item.item || item.description || 'صنف'),
        description: String(item.description || item.item || 'صنف'),
        unit_price: this.toNumber(item.unit_price),
        quantity: this.toNumber(item.quantity),
        discount: this.toNumber(item.discount),
        discount_type: Number(item.discount_type) || undefined,
        tax1: isInternational
          ? env.daftra.vatZeroTaxId
          : Number(item.tax1) || env.daftra.vat15InclusiveTaxId,
        account_id: Number(item.sales_account_id) || revenueAccountId,
      })),
    };
  }

  private extractCancellationReason(webhookPayload: any, details: any): string {
    const raw = webhookPayload?.payload || webhookPayload?.order || webhookPayload?.data || webhookPayload || {};
    const cancelledHistory = Array.isArray(details?.histories)
      ? details.histories.find((history: any) => String(history?.order_status_name || '').includes('ملغ'))
      : null;
    return String(
      raw?.cancellation_reason ||
      raw?.cancel_reason ||
      raw?.reason?.name ||
      raw?.reason ||
      raw?.comment ||
      cancelledHistory?.comment ||
      'إلغاء كامل من زد'
    );
  }

  private toNumber(value: any): number {
    const parsed = Number.parseFloat(String(value ?? 0).replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? Math.abs(parsed) : 0;
  }

  // ──────────────────────────────────────────────────────────────
  // 1.C متابعة حالة الشحن وتسوية الدفع عند الاستلام بعد التوصيل
  // ──────────────────────────────────────────────────────────────
  async handleZidOrderStatusUpdate(
    zidOrderId: string,
    webhookPayload: any,
    source: 'WEBHOOK' | 'POLLER' | 'RETRY_ENGINE' = 'WEBHOOK',
    verifyWithZid: boolean = true
  ): Promise<Order | null> {
    const cleanZidOrderId = String(zidOrderId).replace(/^ZID-/i, '');
    const storeOrderId = `ZID-${cleanZidOrderId}`;
    let details = this.unwrapZidOrder(webhookPayload);

    if (verifyWithZid) {
      try {
        const response: any = await zidClient.getOrderDetails(cleanZidOrderId);
        details = response?.order || response?.data?.order || response?.data || response || details;
      } catch (error: any) {
        logger.warn(
          `[OrderStatus] Could not refresh Zid order ${cleanZidOrderId}; using webhook payload: ${error.message}`
        );
      }
    }

    const zidStatus = this.extractZidOrderStatus(details);
    if (['cancelled', 'canceled'].includes(normalizeText(zidStatus))) {
      return this.handleZidOrderCancellation(cleanZidOrderId, webhookPayload);
    }

    const order = await Order.findOne({ where: { storeOrderId } });
    if (!order) {
      logger.warn(`[OrderStatus] Ignoring status update for unknown order ${storeOrderId}.`);
      return null;
    }

    this.applyZidTracking(order, details);
    if (verifyWithZid && details && Object.keys(details).length > 0) {
      order.rawOrderData = details;
    }

    if (isCodPaymentMethod(order.paymentMethod) && order.codSettlementStatus === 'NOT_APPLICABLE') {
      order.codSettlementStatus = 'PENDING_DELIVERY';
    }
    await order.save();

    if (isCodPaymentMethod(order.paymentMethod) && this.isZidOrderDelivered(details)) {
      return this.settleDeliveredCodOrder(order.id, details, source);
    }

    return order;
  }

  async retryCodSettlement(orderId: number): Promise<Order> {
    const order = await Order.findByPk(orderId);
    if (!order) throw new NotFoundError('الطلب غير موجود');
    if (order.storeType !== 'ZID' || !isCodPaymentMethod(order.paymentMethod)) {
      throw new ConflictError('هذا الطلب ليس طلب دفع عند الاستلام من زد');
    }
    if (order.codSettlementStatus === 'SETTLED') return order;
    if (order.status.startsWith('CANCEL')) {
      throw new ConflictError('الطلب دخل مسار الإلغاء ولا يمكن تسجيل سداد COD له');
    }

    const zidOrderId = order.storeOrderId.replace(/^ZID-/i, '');
    const response: any = await zidClient.getOrderDetails(zidOrderId);
    const details = response?.order || response?.data?.order || response?.data || response;
    this.applyZidTracking(order, details);
    await order.save();

    if (!this.isZidOrderDelivered(details)) {
      throw new ConflictError('زد لا يؤكد أن الطلب تم توصيله حتى الآن');
    }

    return this.settleDeliveredCodOrder(order.id, details, 'RETRY_ENGINE', true);
  }

  private async settleDeliveredCodOrder(
    orderId: number,
    details: any,
    source: 'WEBHOOK' | 'POLLER' | 'RETRY_ENGINE',
    allowStaleRetry: boolean = false
  ): Promise<Order> {
    const existingRequest = this.codSettlementRequests.get(orderId);
    if (existingRequest) return existingRequest;

    const request = this.processDeliveredCodSettlement(orderId, details, source, allowStaleRetry)
      .finally(() => this.codSettlementRequests.delete(orderId));
    this.codSettlementRequests.set(orderId, request);
    return request;
  }

  private async processDeliveredCodSettlement(
    orderId: number,
    details: any,
    source: 'WEBHOOK' | 'POLLER' | 'RETRY_ENGINE',
    allowStaleRetry: boolean
  ): Promise<Order> {
    const staleCutoff = new Date(Date.now() - COD_SETTLEMENT_STALE_MS);
    const lockableStates: any[] = [
      { codSettlementStatus: null },
      { codSettlementStatus: { [Op.in]: ['NOT_APPLICABLE', 'PENDING_DELIVERY', 'FAILED', 'REVIEW_REQUIRED'] } },
    ];
    if (allowStaleRetry) {
      lockableStates.push({
        codSettlementStatus: 'PROCESSING',
        codSettlementStartedAt: { [Op.lt]: staleCutoff },
      });
    }

    const [locked] = await Order.update(
      {
        codSettlementStatus: 'PROCESSING',
        codSettlementStartedAt: new Date(),
        codSettlementMessage: 'جارٍ تسجيل سداد COD في خزينة شركة الشحن.',
      },
      { where: { id: orderId, [Op.or]: lockableStates } }
    );

    let order = await Order.findByPk(orderId);
    if (!order) throw new NotFoundError('الطلب غير موجود');
    if (!locked || order.codSettlementStatus === 'SETTLED') return order;

    const shippingMethod = this.extractShippingMethod(details);
    const mapping = await this.resolveCodTreasury(order, shippingMethod);
    if (!mapping) {
      order.codSettlementStatus = 'REVIEW_REQUIRED';
      order.codSettlementStartedAt = null;
      order.codSettlementMessage = `شركة الشحن "${shippingMethod.name || 'غير معروفة'}" ليس لها خزينة COD معرّفة.`;
      await order.save();
      return order;
    }

    order.shippingMethodId = shippingMethod.id || order.shippingMethodId;
    order.shippingMethodName = shippingMethod.name || order.shippingMethodName;
    order.codTreasuryId = mapping.treasuryId;

    if (!order.daftraDraftInvoiceId) {
      order.codSettlementStatus = 'FAILED';
      order.codSettlementStartedAt = null;
      order.codSettlementMessage = 'لا يمكن تسجيل سداد COD قبل إصدار فاتورة دفترة.';
      await order.save();
      return order;
    }

    const transactionId = `COD-${order.storeOrderId}`;
    const startedAt = Date.now();

    try {
      const invoiceResponse: any = await daftraClient.getInvoice(order.daftraDraftInvoiceId);
      const invoice = this.extractDaftraInvoice(invoiceResponse);
      const payments = this.extractDaftraInvoicePayments(invoice);
      const matchingPayment = this.findCodPayment(payments, transactionId);

      if (matchingPayment) {
        order = await this.markCodSettlementComplete(order, mapping, matchingPayment);
        return order;
      }

      const paidAmount = this.toNumber(invoice?.summary_paid);
      const unpaidAmount = this.toNumber(invoice?.summary_unpaid);
      if (paidAmount > 0 || (unpaidAmount <= 0 && this.toNumber(invoice?.summary_total) > 0)) {
        order.codSettlementStatus = 'REVIEW_REQUIRED';
        order.codSettlementStartedAt = null;
        order.codSettlementMessage =
          'الفاتورة عليها سداد سابق غير مرتبط بتسوية COD الآلية؛ يلزم مراجعتها قبل أي سداد جديد.';
        await order.save();
        return order;
      }

      const paymentAmount = unpaidAmount || this.toNumber(order.totalAmount);
      if (paymentAmount <= 0) {
        order.codSettlementStatus = 'FAILED';
        order.codSettlementStartedAt = null;
        order.codSettlementMessage = 'قيمة الفاتورة المتبقية غير صالحة لتسجيل سداد COD.';
        await order.save();
        return order;
      }

      const deliveredAt = details?.delivered_at ? new Date(details.delivered_at) : new Date();
      const paymentDate = !isNaN(deliveredAt.getTime())
        ? deliveredAt.toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0];

      let paymentResponse: any;
      try {
        paymentResponse = await daftraClient.addInvoicePayment({
          invoice_id: order.daftraDraftInvoiceId,
          amount: paymentAmount,
          treasury_id: mapping.treasuryId,
          payment_method: `الدفع عند الاستلام - ${mapping.treasuryName}`,
          date: paymentDate,
          transaction_id: transactionId,
          notes: `تحصيل COD بعد توصيل طلب زد ${order.storeOrderId} بواسطة ${mapping.shippingMethodName} | ${transactionId}`,
        });
      } catch (paymentError) {
        // قد تكون دفترة حفظت السداد ثم انقطع الاتصال؛ نعيد القراءة قبل إعلان الفشل.
        const retryInvoiceResponse: any = await daftraClient.getInvoice(order.daftraDraftInvoiceId);
        const retryInvoice = this.extractDaftraInvoice(retryInvoiceResponse);
        const recoveredPayment = this.findCodPayment(
          this.extractDaftraInvoicePayments(retryInvoice),
          transactionId
        );
        if (!recoveredPayment) throw paymentError;
        paymentResponse = recoveredPayment;
      }

      const paymentRecord =
        paymentResponse?.data?.InvoicePayment ||
        paymentResponse?.InvoicePayment ||
        paymentResponse?.data ||
        paymentResponse;
      order = await this.markCodSettlementComplete(order, mapping, paymentRecord);

      await SyncLog.create({
        entityType: 'ORDER',
        entityId: order.id,
        action: source === 'RETRY_ENGINE' ? 'RETRY' : 'UPDATE',
        direction: 'ZID_TO_DAFTRA',
        source,
        requestUrl: `${env.daftra.baseUrl}/invoice_payments.json`,
        requestMethod: 'POST',
        requestPayload: {
          invoiceId: order.daftraDraftInvoiceId,
          treasuryId: mapping.treasuryId,
          transactionId,
        },
        responseBody: { paymentId: order.daftraPaymentId },
        status: 'SUCCESS',
        durationMs: Date.now() - startedAt,
      });

      return order;
    } catch (error: any) {
      order.codSettlementStatus = 'FAILED';
      order.codSettlementStartedAt = null;
      order.codSettlementMessage = `فشل تسجيل سداد COD في دفترة: ${error.message}`;
      await order.save();

      await SyncLog.create({
        entityType: 'ORDER',
        entityId: order.id,
        action: source === 'RETRY_ENGINE' ? 'RETRY' : 'UPDATE',
        direction: 'ZID_TO_DAFTRA',
        source,
        requestUrl: `${env.daftra.baseUrl}/invoice_payments.json`,
        requestMethod: 'POST',
        requestPayload: {
          invoiceId: order.daftraDraftInvoiceId,
          treasuryId: mapping.treasuryId,
          transactionId,
        },
        status: 'FAILED',
        errorMessage: error.message,
        durationMs: Date.now() - startedAt,
      });

      logger.error(`[OrderService] COD settlement failed for ${order.storeOrderId}: ${error.message}`);
      return order;
    }
  }

  private unwrapZidOrder(payload: any): any {
    return payload?.payload || payload?.order || payload?.data?.order || payload?.data || payload || {};
  }

  private extractZidOrderStatus(details: any): string {
    return String(
      details?.order_status?.code ||
        details?.display_status?.code ||
        details?.status?.code ||
        (typeof details?.order_status === 'string' ? details.order_status : '') ||
        (typeof details?.status === 'string' ? details.status : '') ||
        ''
    );
  }

  private extractShippingMethod(details: any): { id: string | null; name: string; code: string } {
    const method = details?.shipping?.method || details?.shipping_method || {};
    return {
      id: method?.id !== undefined && method?.id !== null ? String(method.id) : null,
      name: String(method?.name || method?.display_name || details?.shipping_method_name || '').trim(),
      code: String(method?.code || details?.shipping_method?.code || '').trim(),
    };
  }

  private extractShippingStatus(details: any): string {
    if (details?.delivered_at) return 'تم التوصيل';

    const zidStatus = normalizeText(this.extractZidOrderStatus(details));
    const isOrderCancelled = ['cancelled', 'canceled'].includes(zidStatus);

    const candidates = [
      details?.shipping?.method?.order_shipping_status,
      details?.shipping?.method?.tracking?.status,
      details?.display_status?.name,
      details?.order_status?.name,
      this.extractZidOrderStatus(details),
    ];

    const status = candidates.find((candidate) => {
      const normalized = normalizeText(String(candidate || ''));
      if (!normalized || ['n/a', 'na', 'غير متاح'].includes(normalized)) return false;
      // إذا كان الطلب نفسه نشطاً وغير ملغي، لا نأخذ حالة البوليصة الملغاة حتى لا تغطي على حالة الطلب النشط
      if (!isOrderCancelled && (normalized.includes('cancel') || normalized.includes('ملغ'))) {
        return false;
      }
      return true;
    });

    return String(status || '').trim();
  }

  private isZidOrderDelivered(details: any): boolean {
    if (details?.delivered_at) return true;
    const candidates = [
      this.extractZidOrderStatus(details),
      this.extractShippingStatus(details),
      details?.shipping?.method?.tracking?.status,
    ].map(normalizeText);
    return candidates.some((status) =>
      ['delivered', 'تم التوصيل', 'تم التسليم'].some(
        (deliveredStatus) => status === deliveredStatus || status.includes(deliveredStatus)
      )
    );
  }

  private applyZidTracking(order: Order, details: any): void {
    const method = this.extractShippingMethod(details);
    const zidStatus = this.extractZidOrderStatus(details);
    const shippingStatus = this.extractShippingStatus(details);
    const rawTimestamp = details?.updated_at || details?.modified_at || details?.delivered_at;
    const parsedTimestamp = rawTimestamp ? new Date(rawTimestamp) : new Date();

    if (method.id) order.shippingMethodId = method.id;
    if (method.name) order.shippingMethodName = method.name;
    if (zidStatus) order.zidOrderStatus = zidStatus;
    if (shippingStatus) order.shippingStatus = shippingStatus;
    order.shippingStatusUpdatedAt = isNaN(parsedTimestamp.getTime()) ? new Date() : parsedTimestamp;
  }

  private async resolveShippingTreasury(
    shippingMethodId: string | null,
    shippingMethodName: string
  ): Promise<ShippingTreasuryMapping | null> {
    if (shippingMethodId) {
      const byId = await ShippingTreasuryMapping.findOne({
        where: { shippingMethodId, isActive: true },
      });
      if (byId) return byId;
    }

    const mappings = await ShippingTreasuryMapping.findAll({ where: { isActive: true } });
    const normalizedName = normalizeText(shippingMethodName);
    return (
      mappings.find((mapping) => normalizeText(mapping.shippingMethodName) === normalizedName) || null
    );
  }

  /**
   * COD collected by the store (pickup) is deposited in the dedicated Zid
   * pickup treasury. Courier deliveries continue to use the courier-specific
   * shipping treasury mappings.
   */
  private async resolveCodTreasury(
    order: Order,
    shippingMethod: { id: string | null; name: string; code: string }
  ): Promise<ShippingTreasuryMapping | null> {
    const normalizedCode = normalizeText(shippingMethod.code);
    const normalizedName = normalizeText(shippingMethod.name);
    const isPickup =
      ['pickup', 'pick_up', 'store_pickup', 'self_pickup'].includes(normalizedCode) ||
      normalizedName.includes('استلام من الفرع') ||
      normalizedName.includes('استلام من المتجر') ||
      normalizedName.includes('pickup');

    if (isPickup) {
      const paymentMapping = await PaymentMapping.findOne({
        where: { paymentMethodKey: normalizeText(order.paymentMethod), isActive: true },
      });

      if (paymentMapping) {
        return {
          shippingMethodId: shippingMethod.id,
          shippingMethodName: shippingMethod.name || 'استلام من الفرع',
          treasuryId: paymentMapping.treasuryId,
          treasuryName: paymentMapping.treasuryName || paymentMapping.paymentMethodLabel,
          isActive: true,
        } as ShippingTreasuryMapping;
      }
    }

    return this.resolveShippingTreasury(shippingMethod.id, shippingMethod.name);
  }

  private extractDaftraInvoice(response: any): any {
    return response?.data?.Invoice || response?.Invoice || response?.data || response || {};
  }

  private extractDaftraInvoicePayments(invoice: any): any[] {
    return Array.isArray(invoice?.InvoicePayment)
      ? invoice.InvoicePayment
      : Array.isArray(invoice?.payments)
      ? invoice.payments
      : [];
  }

  private findCodPayment(payments: any[], transactionId: string): any | null {
    return (
      payments.find((payment: any) => {
        const paymentData = payment?.InvoicePayment || payment;
        const reference = String(
          paymentData?.transaction_id || paymentData?.transaction_number || paymentData?.reference || ''
        );
        const notes = String(paymentData?.notes || '');
        return reference === transactionId || notes.includes(transactionId);
      }) || null
    );
  }

  private async markCodSettlementComplete(
    order: Order,
    mapping: ShippingTreasuryMapping,
    payment: any
  ): Promise<Order> {
    const paymentData = payment?.InvoicePayment || payment || {};
    order.codSettlementStatus = 'SETTLED';
    order.codSettlementStartedAt = null;
    order.codSettledAt = new Date();
    order.codTreasuryId = mapping.treasuryId;
    order.treasuryId = mapping.treasuryId;
    order.daftraPaymentId = paymentData?.id ? String(paymentData.id) : order.daftraPaymentId;
    order.codSettlementMessage = `تم سداد الفاتورة في خزينة ${mapping.treasuryName} رقم ${mapping.treasuryId}.`;
    await order.save();
    return order;
  }

  // ──────────────────────────────────────────────────────────────
  // 2. محرك المطابقة الذكي للأصناف (On-Demand Product Matcher)
  // ──────────────────────────────────────────────────────────────
  private async matchProductToDaftra(
    sku: string,
    barcode?: string
  ): Promise<{ daftraProductId: number } | null> {
    // 1️⃣ الخطوة الأولى (محلياً): البحث في جدول الربط الداخلي product_mappings
    const mapping = await ProductMapping.findOne({ where: { sku, syncStatus: 'SYNCED' } });
    if (mapping) return { daftraProductId: mapping.daftraProductId };

    // 2️⃣ الخطوة الثانية (محلياً): البحث في بنود المبيعات السابقة المطابقة (دون تلويث جدول المنتجات والنشر)
    const cachedOrderItem = await OrderItem.findOne({
      where: { sku, matchStatus: 'MATCHED', daftraProductId: { [Op.ne]: null } },
    });
    if (cachedOrderItem && cachedOrderItem.daftraProductId) {
      return { daftraProductId: cachedOrderItem.daftraProductId };
    }

    if (barcode) {
      const cachedByBarcode = await OrderItem.findOne({
        where: { barcode, matchStatus: 'MATCHED', daftraProductId: { [Op.ne]: null } },
      });
      if (cachedByBarcode && cachedByBarcode.daftraProductId) {
        return { daftraProductId: cachedByBarcode.daftraProductId };
      }
    }

    // 3️⃣ الخطوة الثالثة (أونلاين في دفترة): البحث في دفترة بالـ SKU للمنتجات القديمة
    logger.info(`[OrderService] Product "${sku}" not found locally. Querying Daftra online by SKU...`);
    const daftraProductBySku = await daftraClient.searchProductBySku(sku);

    if (daftraProductBySku && daftraProductBySku.id) {
      const daftraId = parseInt(String(daftraProductBySku.id), 10);
      logger.info(`[OrderService] Found legacy Daftra product online by SKU "${sku}" (ID: #${daftraId})`);
      return { daftraProductId: daftraId };
    }

    // 4️⃣ الخطوة الرابعة (أونلاين في دفترة): البحث في دفترة بالباركود Barcode (أو إذا كان الـ SKU نفسه باركود)
    const barcodeCandidates: string[] = [barcode, sku].filter((b): b is string => Boolean(b && b.trim()));
    for (const b of barcodeCandidates) {
      logger.info(`[OrderService] Querying Daftra online by Barcode "${b}"...`);
      const daftraProductByBarcode = await daftraClient.searchProductByBarcode(b);

      if (daftraProductByBarcode && daftraProductByBarcode.id) {
        const daftraId = parseInt(String(daftraProductByBarcode.id), 10);
        logger.info(`[OrderService] Found legacy Daftra product online by Barcode "${b}" (ID: #${daftraId})`);
        return { daftraProductId: daftraId };
      }
    }

    // إذا لم يُعثر عليه محلياً ولا في دفترة أونلاين بالـ SKU ولا بالباركود:
    logger.warn(`[OrderService] Product "${sku}" (Barcode: ${barcode || 'N/A'}) NOT found in Daftra online or locally.`);
    return null;
  }

  // ──────────────────────────────────────────────────────────────
  // 3. صمام أمان وسائل الدفع (Payment Circuit Breaker)
  // ──────────────────────────────────────────────────────────────
  private async resolvePaymentTreasury(paymentMethod: string): Promise<PaymentMapping | null> {
    const rawKey = (paymentMethod || '').toLowerCase().trim();
    const normalizedKey = rawKey.replace(/[\s\-\_]+/g, '_');

    let mapping = await PaymentMapping.findOne({
      where: { paymentMethodKey: normalizedKey, isActive: true },
    });

    if (!mapping) {
      const compactKey = normalizedKey.replace(/_/g, '');
      mapping = await PaymentMapping.findOne({
        where: { paymentMethodKey: compactKey, isActive: true },
      });
    }

    if (!mapping && normalizedKey.startsWith('zid_')) {
      const strippedKey = normalizedKey.replace(/^zid_/, '');
      mapping = await PaymentMapping.findOne({
        where: { paymentMethodKey: strippedKey, isActive: true },
      });
    }

    return mapping || null;
  }

  /**
   * البحث عن العميل أو إنشاؤه في دفترة باسمه الحقيقي (Client Resolver & Creator)
   */
  private async resolveOrCreateClient(
    customerName: string,
    customerPhone?: string | null,
    customerEmail?: string | null,
    shippingAddress?: string | null,
    storeType?: string,
    city?: string | null,
    countryCode?: string | null,
    streetAddress?: string | null
  ): Promise<number> {
    // 0. إذا كان خيار التجميع مفعلاً لمتجر زد (الخيار الأول المعتمد محاسبياً):
    // يتم التوجيه مباشرة إلى الحساب الموحد (حساب عملاء زد b2c - معرف 3964) لتجنب تضخم شجرة الحسابات
    if (storeType === 'ZID' && env.daftra.consolidateZidClients) {
      return env.daftra.zidGuestClientId;
    }

    try {
      const addressToSave = streetAddress || shippingAddress || undefined;
      const zatcaPhone = formatZatcaPhone(customerPhone);

      // 1. البحث برقم الهاتف
      const phoneToSearch = customerPhone || zatcaPhone;
      if (phoneToSearch) {
        const clientByPhone = await daftraClient.searchClientByPhone(phoneToSearch);
        if (clientByPhone?.id) {
          const cId = parseInt(String(clientByPhone.id), 10);
          daftraClient
            .updateClient(cId, {
              business_name: (customerName || '').trim() || undefined,
              first_name: '',
              last_name: '',
              city: city || undefined,
              country_code: countryCode || 'SA',
              address1: addressToSave,
              phone1: zatcaPhone || undefined,
            })
            .catch(() => {});
          return cId;
        }
      }

      // 2. البحث بالبريد الإلكتروني (إن وجد وغير افتراضي)
      if (customerEmail && !customerEmail.includes('example.com') && !customerEmail.includes('orders@rahmamedical')) {
        const clientByEmail = await daftraClient.searchClientByEmail(customerEmail);
        if (clientByEmail?.id) {
          const cId = parseInt(String(clientByEmail.id), 10);
          daftraClient
            .updateClient(cId, {
              business_name: (customerName || '').trim() || undefined,
              first_name: '',
              last_name: '',
              city: city || undefined,
              country_code: countryCode || 'SA',
              address1: addressToSave,
              phone1: zatcaPhone || undefined,
            })
            .catch(() => {});
          return cId;
        }
      }

      // 3. إنشاء عميل جديد في دفترة باسمه الحقيقي
      const name = (customerName || '').trim();
      if (name) {
        const created = await daftraClient.createClient({
          business_name: name,
          first_name: '',
          last_name: '',
          email: sanitizeEmail(customerEmail, `customer_${Date.now()}@rahmamedical.online`),
          phone1: zatcaPhone || undefined,
          address1: addressToSave,
          city: city || undefined,
          country_code: countryCode || 'SA',
          category_id: 39, // تصنيف: عميل اونلاين
        });

        if (created?.id) return parseInt(String(created.id), 10);
      }
    } catch (err: any) {
      logger.warn(`[OrderService] Could not resolve/create client for "${customerName}": ${err.message}. Using default client.`);
    }

    return storeType === 'ZID' ? env.daftra.zidGuestClientId : env.daftra.defaultClientId;
  }

  // ──────────────────────────────────────────────────────────────
  // 4. بناء وإرسال مسودة الفاتورة لدفترة (Daftra Draft Invoice Builder)
  // ──────────────────────────────────────────────────────────────
  private async createDraftInvoice(
    order: Order,
    items: OrderItem[],
    paymentMapping: PaymentMapping
  ): Promise<{ invoiceId: number; invoiceNumber: string }> {
    // استخراج بيانات العنوان والدولة والمدينة بالتفصيل
    const rawData: any = order.rawOrderData || {};
    const addressInfo = extractAddressDetails(rawData.shipping, rawData.shipping_address);
    const zatcaPhone = formatZatcaPhone(order.customerPhone);
    const isInternational = isInternationalCountry(addressInfo.countryCode);

    // تحديد حساب الإيراد حسب قناة البيع (Channel Revenue Separation)
    const revenueAccountId =
      order.storeType === 'ZID' ? env.daftra.zidRevenueAccountId : env.daftra.trendyolRevenueAccountId;

    // تحديد معرف العميل باسمه الحقيقي في دفترة مع حفظ بيانات العنوان
    const clientId = await this.resolveOrCreateClient(
      order.customerName,
      order.customerPhone,
      order.customerEmail,
      order.shippingAddress || addressInfo.fullAddress,
      order.storeType,
      addressInfo.city,
      addressInfo.countryCode,
      addressInfo.streetAddress
    );

    // بناء ملاحظات الفاتورة (Customer details in notes)
    const invoiceNotes = [
      `طلب ${order.storeType === 'ZID' ? 'متجر زد' : 'ترينديول'} #${order.storeOrderId}`,
      isInternational ? `🌍 نوع المعاملة: تصدير دولي (المادة 32 - كود إعفاء الزكاة: VATEX-SA-EXPORT)` : '',
      `العميل: ${order.customerName}`,
      (zatcaPhone || order.customerPhone) ? `الجوال: ${zatcaPhone || order.customerPhone}` : '',
      order.shippingAddress ? `عنوان الشحن: ${order.shippingAddress}` : '',
      isInternational ? `دولة الشحن: ${addressInfo.countryName || addressInfo.countryCode}` : '',
      `وسيلة الدفع: ${paymentMapping.paymentMethodLabel}`,
    ]
      .filter(Boolean)
      .join(' | ');

    // بناء بنود الأصناف (Invoice Items) مع دعم التصدير الدولي
    const invoiceItems = items.map((item) => {
      if (isInternational) {
        return {
          product_id: item.daftraProductId!,
          item_id: item.daftraProductId!,
          item: item.productName,
          description: `${item.productName} (تصدير دولي - إعفاء بموجب المادة 32)`,
          unit_price: item.unitPrice,
          quantity: item.quantity,
          discount: item.discount || 0,
          tax1: env.daftra.vatZeroTaxId, // صفرية 0% (معرف 5 بدفترة)
          exemption_reason_code: 'VATEX-SA-EXPORT',
          exemption_reason: 'تصدير سلع لخارج المملكة (المادة 32)',
          account_id: revenueAccountId,
        };
      }

      return {
        product_id: item.daftraProductId!,
        item_id: item.daftraProductId!,
        item: item.productName,
        description: item.productName,
        unit_price: item.unitPrice,
        quantity: item.quantity,
        discount: item.discount || 0,
        tax1: item.taxPercentage === 0 ? env.daftra.vatZeroTaxId : env.daftra.vat15InclusiveTaxId,
        account_id: revenueAccountId,
      };
    });

    // استخراج الاسم الأول والأخير للعميل لضمان ظهوره بشكل سليم في قوالب فواتير دفترة
    const nameParts = (order.customerName || '').trim().split(/\s+/);
    const firstName = nameParts[0] || 'عميل';
    const lastName = nameParts.slice(1).join(' ') || '';

    // بناء الـ Payload الموحد (استخدام حقول الشحن الأصلية لدفترة بدلاً من إدراجه كمنتج في الجدول)
    const invoicePayload: DaftraInvoicePayload = {
      Invoice: {
        client_id: clientId,
        client_business_name: (order.customerName || '').trim() || undefined,
        client_first_name: firstName,
        client_last_name: lastName,
        client_phone1: zatcaPhone || undefined,
        client_email: sanitizeEmail(order.customerEmail),
        client_address1: addressInfo.streetAddress || undefined,
        client_city: addressInfo.city || undefined,
        client_country_code: addressInfo.countryCode || 'SA',
        storehouse_id: env.daftra.storehouseId,
        draft: 0,
        is_draft: 0, // فاتورة معتمدة ومُصدرة مباشرة
        notes: invoiceNotes,

        date:
          order.orderDate && !isNaN(order.orderDate.getTime())
            ? order.orderDate.toISOString().split('T')[0]
            : new Date().toISOString().split('T')[0],
        ...(order.shippingFee > 0
          ? {
              shipping_options: '1',
              shipping_amount: Number(order.shippingFee),
              shipping_tax_id: isInternational || order.taxAmount === 0 ? 0 : env.daftra.vat15InclusiveTaxId,
            }
          : {}),
        ...(order.discountAmount > 0
          ? {
              discount: order.discountAmount,
              discount_type: 1, // خصم بمبلغ ثابت
            }
          : {}),
      },
      InvoiceItem: invoiceItems,
    };

    // إرسال لدفترة عبر DaftraClient
    const response: any = await daftraClient.createInvoice(invoicePayload);

    const invoiceId = parseInt(
      String(response?.id || response?.data?.Invoice?.id || response?.data?.id || 0),
      10
    );
    const invoiceNumber = String(
      response?.invoice_number ||
        response?.data?.Invoice?.number ||
        response?.data?.number ||
        `DRAFT-${order.id}`
    );

    return {
      invoiceId,
      invoiceNumber,
    };
  }

  /**
   * تسجيل سند سداد مالي للفاتورة في الخزينة المناسبة بدفترة
   */
  private async recordInvoicePayment(
    invoiceId: number,
    order: Order,
    paymentMapping: PaymentMapping
  ): Promise<boolean> {
    const isCod = isCodPaymentMethod(paymentMapping.paymentMethodKey);

    if (isCod) {
      logger.info(`[OrderService] Order #${order.storeOrderId} is COD. Skipping automated payment record.`);
      return false;
    }

    if (!paymentMapping.treasuryId) {
      logger.warn(
        `[OrderService] No treasury ID mapped for payment method "${paymentMapping.paymentMethodKey}". Skipping payment.`
      );
      return false;
    }

    const paymentAmount = Number(order.totalAmount);
    if (!paymentAmount || paymentAmount <= 0) {
      logger.warn(
        `[OrderService] Order #${order.storeOrderId} has invalid or zero totalAmount (${order.totalAmount}). Skipping automated payment.`
      );
      return false;
    }

    try {
      const paymentDate =
        order.orderDate && !isNaN(order.orderDate.getTime())
          ? order.orderDate.toISOString().split('T')[0]
          : new Date().toISOString().split('T')[0];

      await daftraClient.addInvoicePayment({
        invoice_id: invoiceId,
        amount: paymentAmount,
        treasury_id: paymentMapping.treasuryId,
        payment_method: paymentMapping.paymentMethodLabel,
        date: paymentDate,
        transaction_id: String(order.storeOrderId),
        notes: `سداد طلب ${order.storeType} #${order.storeOrderId} عبر ${paymentMapping.paymentMethodLabel}`,
      });

      logger.info(
        `[OrderService] Payment recorded for invoice #${invoiceId} in treasury #${paymentMapping.treasuryId} (${paymentMapping.treasuryName || paymentMapping.paymentMethodLabel})`
      );
      return true;
    } catch (paymentErr: any) {
      logger.error(
        `[OrderService] Could not record automated payment for invoice #${invoiceId}: ${paymentErr.message}`
      );
      return false;
    }
  }

  // ──────────────────────────────────────────────────────────────
  // 5. إعادة المحاولة الذكية (Smart Retry for Failed Orders)
  // ──────────────────────────────────────────────────────────────
  async retryOrder(orderId: number): Promise<Order> {
    const order = await Order.findByPk(orderId);
    if (!order) throw new NotFoundError('الطلب غير موجود');

    if (order.status === 'DRAFT_CREATED') {
      throw new ConflictError('الفاتورة مُصدرة بالفعل في دفترة. لا حاجة لإعادة المحاولة.');
    }

    if (order.status === 'PROCESSING') {
      throw new ConflictError('الطلب قيد المعالجة بالفعل.');
    }

    if (['CANCEL_PENDING', 'CANCELLED', 'CANCEL_FAILED', 'CANCEL_REVIEW_REQUIRED'].includes(order.status)) {
      throw new ConflictError('هذا الطلب دخل مسار الإلغاء ولا يمكن إعادة محاولة فوترته.');
    }

    // إعادة بناء الـ Payload من البيانات المحفوظة
    let orderItems = await OrderItem.findAll({ where: { orderId: order.id } });

    // إذا كان الطلب بدون بنود (مثل الطلبات المسحوبة سابقاً كملخص)، نحاول جلب تفاصيل الأصناف من زد
    if (orderItems.length === 0 && order.storeType === 'ZID') {
      try {
        const raw = order.rawOrderData as any;
        const zidId = raw?.id || raw?.order_id || String(order.storeOrderId).replace('ZID-', '');
        if (zidId) {
          const fullDetails = await zidClient.getOrderDetails(zidId);
          const rawProducts = fullDetails?.order?.products || fullDetails?.order?.items || [];
          for (const item of rawProducts) {
            const p = item.product || {};
            const sku = item.sku || p.sku || item.product_sku || '';
            const barcode = item.barcode || p.barcode || null;
            const matchedProduct = await this.matchProductToDaftra(sku, barcode || undefined);

            await OrderItem.create({
              orderId: order.id,
              sku,
              barcode,
              productName: item.name || p.name || item.product_name || 'صنف',
              quantity: parseInt(item.quantity as any, 10) || 1,
              unitPrice: parseFloat(item.price || item.unit_price || 0),
              discount: parseFloat(item.discount || 0),
              taxPercentage: parseFloat(item.tax_percent || item.tax_percentage || 15),
              lineTotal: parseFloat(item.total || item.line_total || 0),
              daftraProductId: matchedProduct?.daftraProductId || null,
              matchStatus: matchedProduct ? 'MATCHED' : 'UNMATCHED',
            });
          }
          orderItems = await OrderItem.findAll({ where: { orderId: order.id } });
        }
      } catch (fetchErr: any) {
        logger.warn(`[OrderService] Could not backfill items for order #${order.id}: ${fetchErr.message}`);
      }
    }

    // إذا ظل الطلب بدون أصناف، نمنع الإرسال لدفترة لتفادي خطأ 400 (فاتورة فارغة)
    if (orderItems.length === 0) {
      order.status = 'UNMAPPED_PRODUCT';
      order.statusMessage = 'لا توجد أصناف مسجلة في هذا الطلب لإصدار فاتورة بها.';
      await order.save();
      return order;
    }

    // إعادة فحص وسيلة الدفع
    const paymentMapping = await this.resolvePaymentTreasury(order.paymentMethod);
    if (!paymentMapping) {
      order.status = 'UNMAPPED_PAYMENT';
      order.statusMessage = `لا تزال وسيلة الدفع "${order.paymentMethod}" غير معرّفة.`;
      await order.save();
      return order;
    }

    order.treasuryId = paymentMapping.treasuryId;

    // إعادة فحص مطابقة الأصناف
    for (const item of orderItems) {
      if (item.matchStatus === 'UNMATCHED') {
        const matched = await this.matchProductToDaftra(item.sku, item.barcode || undefined);
        if (matched) {
          item.daftraProductId = matched.daftraProductId;
          item.matchStatus = 'MATCHED';
          await item.save();
        }
      }
    }

    const stillUnmatched = orderItems.filter((oi) => oi.matchStatus === 'UNMATCHED');
    if (stillUnmatched.length > 0) {
      order.status = 'UNMAPPED_PRODUCT';

      order.statusMessage = `لا تزال هناك أصناف غير مطابقة: [${stillUnmatched.map((o) => o.sku).join(', ')}].`;
      await order.save();
      return order;
    }

    // إعادة إرسال مسودة الفاتورة لدفترة مع فحص عدم التكرار (Idempotency Guard)
    try {
      order.status = 'PROCESSING';
      await order.save();

      // فحص استباقي: هل تم إنشاء الفاتورة في دفترة أثناء محاولة سابقة حدث فيها انقطاع اتصال؟
      const existingDaftraInvoice = await daftraClient.searchInvoiceByOrderRef(order.storeOrderId);
      if (existingDaftraInvoice && existingDaftraInvoice.id) {
        order.status = 'DRAFT_CREATED';
        order.daftraDraftInvoiceId = existingDaftraInvoice.id;
        order.daftraInvoiceNumber = existingDaftraInvoice.no || `INV-${existingDaftraInvoice.id}`;
        order.statusMessage = `تم العثور على الفاتورة رقم ${order.daftraInvoiceNumber} مسجلة مسبقاً في دفترة، تم ربطها بنجاح دون تكرار.`;
        await order.save();
        logger.info(`[OrderService] Idempotency: Linked existing Daftra invoice #${order.daftraDraftInvoiceId} for order ${order.storeOrderId}`);
        return order;
      }

      const invoiceResult = await this.createDraftInvoice(order, orderItems, paymentMapping);
      const paymentRecorded = await this.recordInvoicePayment(invoiceResult.invoiceId, order, paymentMapping);

      order.status = 'DRAFT_CREATED';
      order.daftraDraftInvoiceId = invoiceResult.invoiceId;
      order.daftraInvoiceNumber = invoiceResult.invoiceNumber;
      if (isCodPaymentMethod(order.paymentMethod) && order.codSettlementStatus === 'NOT_APPLICABLE') {
        order.codSettlementStatus = 'PENDING_DELIVERY';
      }
      order.statusMessage = paymentRecorded
        ? `الفاتورة ${invoiceResult.invoiceNumber} تم إصدارها معتمدة ومسددة في خزينة (${paymentMapping.treasuryName || paymentMapping.paymentMethodLabel}) بنجاح بعد إعادة المحاولة.`
        : `الفاتورة ${invoiceResult.invoiceNumber} تم إصدارها معتمدة في دفترة (غير مسددة) بعد إعادة المحاولة.`;
      await order.save();

      logger.info(`[OrderService] Retry SUCCESS: Invoice ${invoiceResult.invoiceNumber} for order ${order.storeOrderId} (Payment recorded: ${paymentRecorded})`);
    } catch (error: any) {
      order.status = 'FAILED';
      order.statusMessage = `فشلت إعادة المحاولة: ${error.message}`;
      await order.save();

      logger.error(`[OrderService] Retry FAILED for order ${order.storeOrderId}: ${error.message}`);
    }

    return order;
  }

  async retryOrderCancellation(orderId: number): Promise<Order> {
    const order = await Order.findByPk(orderId);
    if (!order) throw new NotFoundError('الطلب غير موجود');
    if (order.storeType !== 'ZID') throw new ConflictError('الإلغاء التلقائي متاح لطلبات زد فقط');
    if (order.status === 'CANCELLED') return order;
    if (!['CANCEL_FAILED', 'CANCEL_PENDING'].includes(order.status)) {
      throw new ConflictError('الطلب ليس في حالة تسمح بإعادة محاولة الإلغاء');
    }

    return this.handleZidOrderCancellation(
      order.storeOrderId.replace(/^ZID-/i, ''),
      order.rawOrderData
    );
  }

  // ──────────────────────────────────────────────────────────────
  // 6. جلب قائمة الطلبات مع الفلترة (Orders List with Filters)
  // ──────────────────────────────────────────────────────────────
  async getOrders(filters: OrderFilterParams) {
    const where: any = {};
    if (filters.status === 'STALLED') {
      const staleCancellationCutoff = new Date(Date.now() - CANCEL_PENDING_STALE_MS);
      where[Op.or] = [
        {
          status: {
            [Op.in]: ['FAILED', 'UNMAPPED_PAYMENT', 'UNMAPPED_PRODUCT', 'CANCEL_FAILED', 'CANCEL_REVIEW_REQUIRED'],
          },
        },
        {
          status: 'CANCEL_PENDING',
          updatedAt: { [Op.lt]: staleCancellationCutoff },
        },
        {
          codSettlementStatus: { [Op.in]: ['FAILED', 'REVIEW_REQUIRED'] },
        },
        {
          codSettlementStatus: 'PROCESSING',
          codSettlementStartedAt: { [Op.lt]: staleCancellationCutoff },
        },
      ];
    } else if (filters.status) {
      where.status = filters.status;
    }
    if (filters.storeType) where.storeType = filters.storeType;

    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const offset = (page - 1) * limit;

    const { rows, count } = await Order.findAndCountAll({
      where,
      order: [
        ['orderDate', 'DESC'],
        ['id', 'DESC'],
      ],
      limit,
      offset,
    });

    return {
      orders: rows,
      total: count,
      page,
      totalPages: Math.ceil(count / limit),
    };
  }

  // ──────────────────────────────────────────────────────────────
  // 7. إحصائيات لوحة المؤشرات (Dashboard Stats)
  // ──────────────────────────────────────────────────────────────
  async getOrderStats(): Promise<OrderStatsDTO> {
    const totalOrders = await Order.count();
    const draftCreatedOrders = await Order.count({ where: { status: 'DRAFT_CREATED' } });
    const pendingOrders = await Order.count({ where: { status: { [Op.in]: ['PENDING_INVOICE', 'PROCESSING'] } } });
    const failedOrders = await Order.count({ where: { status: 'FAILED' } });
    const unmappedPaymentOrders = await Order.count({ where: { status: 'UNMAPPED_PAYMENT' } });
    const unmappedProductOrders = await Order.count({ where: { status: 'UNMAPPED_PRODUCT' } });
    const cancelledOrders = await Order.count({ where: { status: 'CANCELLED' } });
    const cancellationFailedOrders = await Order.count({ where: { status: 'CANCEL_FAILED' } });
    const cancellationReviewOrders = await Order.count({ where: { status: 'CANCEL_REVIEW_REQUIRED' } });
    const staleCancellationPendingOrders = await Order.count({
      where: {
        status: 'CANCEL_PENDING',
        updatedAt: { [Op.lt]: new Date(Date.now() - CANCEL_PENDING_STALE_MS) },
      },
    });
    const codSettlementIssueOrders = await Order.count({
      where: {
        [Op.or]: [
          { codSettlementStatus: { [Op.in]: ['FAILED', 'REVIEW_REQUIRED'] } },
          {
            codSettlementStatus: 'PROCESSING',
            codSettlementStartedAt: { [Op.lt]: new Date(Date.now() - COD_SETTLEMENT_STALE_MS) },
          },
        ],
      },
    });
    const stalledOrders =
      failedOrders +
      unmappedPaymentOrders +
      unmappedProductOrders +
      cancellationFailedOrders +
      cancellationReviewOrders +
      staleCancellationPendingOrders +
      codSettlementIssueOrders;

    const recentLogs = await SyncLog.findAll({
      where: { entityType: 'ORDER' },
      order: [['createdAt', 'DESC']],
      limit: 10,
    });

    return {
      totalOrders,
      draftCreatedOrders,
      pendingOrders,
      failedOrders,
      unmappedPaymentOrders,
      unmappedProductOrders,
      stalledOrders,
      cancelledOrders,
      cancellationReviewOrders,
      codSettlementIssueOrders,
      recentLogs: recentLogs.map((l) => l.toJSON()),
    };
  }
}

export const orderService = new OrderService();
