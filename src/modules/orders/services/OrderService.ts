import { Op } from 'sequelize';
import { Order } from '../models/Order';
import { OrderItem } from '../models/OrderItem';
import { PaymentMapping } from '../models/PaymentMapping';
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
} from '../dtos/order.dtos';

export class OrderService {
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

    // تجهيز وإرسال الفاتورة لدفترة (معتمدة ومباشرة)
    try {
      const invoiceResult = await this.createDraftInvoice(order, orderItems, paymentMapping);
      const paymentRecorded = await this.recordInvoicePayment(invoiceResult.invoiceId, order, paymentMapping);

      order.status = 'DRAFT_CREATED';
      order.daftraDraftInvoiceId = invoiceResult.invoiceId;
      order.daftraInvoiceNumber = invoiceResult.invoiceNumber;
      order.statusMessage = paymentRecorded
        ? `الفاتورة ${invoiceResult.invoiceNumber} تم إصدارها معتمدة ومسددة في خزينة (${paymentMapping.treasuryName || paymentMapping.paymentMethodLabel}) بنجاح.`
        : `الفاتورة ${invoiceResult.invoiceNumber} تم إصدارها معتمدة في دفترة (غير مسددة).`;
      await order.save();

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

    // 4️⃣ الخطوة الرابعة (أونلاين في دفترة): البحث في دفترة بالباركود Barcode
    if (barcode) {
      logger.info(`[OrderService] Querying Daftra online by Barcode "${barcode}"...`);
      const daftraProductByBarcode = await daftraClient.searchProductByBarcode(barcode);

      if (daftraProductByBarcode && daftraProductByBarcode.id) {
        const daftraId = parseInt(String(daftraProductByBarcode.id), 10);
        logger.info(`[OrderService] Found legacy Daftra product online by Barcode "${barcode}" (ID: #${daftraId})`);
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
    const isCod = ['cod', 'cash_on_delivery', 'zid_cod'].includes(
      (paymentMapping.paymentMethodKey || '').toLowerCase().trim()
    );

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

  // ──────────────────────────────────────────────────────────────
  // 6. جلب قائمة الطلبات مع الفلترة (Orders List with Filters)
  // ──────────────────────────────────────────────────────────────
  async getOrders(filters: OrderFilterParams) {
    const where: any = {};
    if (filters.status === 'STALLED') {
      where.status = { [Op.in]: ['FAILED', 'UNMAPPED_PAYMENT', 'UNMAPPED_PRODUCT'] };
    } else if (filters.status) {
      where.status = filters.status;
    }
    if (filters.storeType) where.storeType = filters.storeType;

    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const offset = (page - 1) * limit;

    const { rows, count } = await Order.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
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
    const stalledOrders = failedOrders + unmappedPaymentOrders + unmappedProductOrders;

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
      recentLogs: recentLogs.map((l) => l.toJSON()),
    };
  }
}

export const orderService = new OrderService();
