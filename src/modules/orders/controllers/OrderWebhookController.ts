import { Request, Response } from 'express';
import { orderService } from '../services/OrderService';
import { env } from '../../../config/env';
import { asyncHandler } from '../../../shared/middlewares/asyncHandler';
import { IncomingOrderPayload } from '../dtos/order.dtos';
import { logger, extractAddressDetails, formatZatcaPhone } from '../../../shared/helpers';

export class OrderWebhookController {
  /**
   * POST /api/webhooks/zid/order-created
   * استقبال طلب جديد من متجر زد
   */
  static handleZidOrderCreated = asyncHandler(async (req: Request, res: Response) => {
    logger.info('[Webhook] Received ZID order-created event');

    const raw = req.body?.payload || req.body?.order || req.body?.data || req.body;

    // تجاهل إشعارات التحقق التجريبية (Verification Ping / Handshake) الخالية من بيانات الطلب
    if (!raw || (!raw.id && !raw.order_id && !raw.code && (!raw.items || raw.items.length === 0) && (!raw.products || raw.products.length === 0))) {
      logger.info('[Webhook] Received empty or verification ping from Zid. Responding 200 OK.');
      return res.status(200).json({
        success: true,
        message: 'تم استقبال إشعار التحقق بنجاح',
      });
    }

    const rawItems = raw.items || raw.products || raw.order_items || [];
    const items = rawItems.map((item: any) => {
      const p = item.product || {};
      return {
        sku: item.sku || p.sku || item.product_sku || '',
        barcode: item.barcode || p.barcode || null,
        productName: item.name || p.name || item.product_name || 'صنف',
        quantity: parseInt(item.quantity as any, 10) || 1,
        unitPrice: parseFloat(item.price || item.unit_price || 0),
        discount: parseFloat(item.discount || 0),
        taxPercentage:
          item.tax_percentage !== undefined && item.tax_percentage !== null
            ? parseFloat(String(item.tax_percentage))
            : item.tax_percent !== undefined && item.tax_percent !== null
            ? parseFloat(String(item.tax_percent))
            : 15,
        lineTotal: parseFloat(item.total || item.line_total || 0),
      };
    });

    const paymentMethodCode =
      raw.payment?.method?.code ||
      (typeof raw.payment?.method === 'string' ? raw.payment.method : null) ||
      raw.payment_method?.code ||
      (typeof raw.payment_method === 'string' ? raw.payment_method : null) ||
      raw.payments?.[0]?.code ||
      raw.payment?.method?.name ||
      raw.payment_method_name ||
      'unknown';

    const zidShippingItem = Array.isArray(raw.payment?.invoice)
      ? raw.payment.invoice.find((entry: any) => entry.code === 'shipping')
      : null;
    const zidCodItem = Array.isArray(raw.payment?.invoice)
      ? raw.payment.invoice.find((entry: any) => entry.code === 'zid_cod' || entry.code === 'cod')
      : null;
    const zidVatItem = Array.isArray(raw.payment?.invoice)
      ? raw.payment.invoice.find((entry: any) => entry.code === 'vat')
      : null;
    const zidSubtotalItem = Array.isArray(raw.payment?.invoice)
      ? raw.payment.invoice.find((entry: any) => entry.code === 'sub_totals_before_vat' || entry.code === 'sub_totals_after_vat')
      : null;
    const zidTotalItem = Array.isArray(raw.payment?.invoice)
      ? raw.payment.invoice.find((entry: any) => entry.code === 'total')
      : null;

    const addressInfo = extractAddressDetails(raw.shipping, raw.shipping_address);

    const payload: IncomingOrderPayload = {
      storeOrderId: `ZID-${raw.id || raw.order_id || raw.code || Date.now()}`,
      storeType: 'ZID',
      customerName:
        raw.customer?.name ||
        (raw.customer?.first_name ? `${raw.customer.first_name} ${raw.customer.last_name || ''}`.trim() : null) ||
        raw.shipping?.name ||
        raw.shipping_address?.name ||
        'عميل زد',
      customerPhone:
        formatZatcaPhone(
          raw.customer?.mobile ||
          raw.customer?.phone ||
          raw.shipping?.phone ||
          raw.shipping_address?.phone
        ) || '',
      customerEmail: raw.customer?.email || null,
      shippingAddress: addressInfo.fullAddress,
      paymentMethod: String(paymentMethodCode).toLowerCase(),

      items,
      subtotal: parseFloat(zidSubtotalItem?.value || raw.sub_total || raw.subtotal || raw.products_sum_total || 0),
      shippingFee:
        parseFloat(
          zidShippingItem?.value ||
          raw.shipping_cost ||
          raw.shipping_fee ||
          raw.shipping?.cost ||
          raw.shipping_cost_string ||
          0
        ) + parseFloat(zidCodItem?.value || raw.cod_cost || raw.cod_fee || 0),
      discountAmount: parseFloat(raw.discount || raw.discount_amount || raw.total_discount || 0),
      taxAmount: parseFloat(zidVatItem?.value || raw.tax_amount || raw.tax || 0),
      totalAmount: parseFloat(zidTotalItem?.value || raw.total || raw.total_amount || raw.order_total || 0),
      orderDate: raw.created_at || raw.order_date || raw.date || new Date().toISOString(),
      rawOrderData: req.body,
    };

    const order = await orderService.handleIncomingOrder(payload);

    res.status(200).json({
      success: true,
      message: 'تم استلام الطلب بنجاح',
      orderId: order.id,
      status: order.status,
    });
  });

  /**
   * POST /api/webhooks/trendyol/order-created
   * استقبال طلب جديد من ترينديول
   */
  static handleTrendyolOrderCreated = asyncHandler(async (req: Request, res: Response) => {
    logger.info('[Webhook] Received TRENDYOL order-created event');

    if (!env.enableTrendyol) {
      logger.warn('[Webhook] Trendyol webhook received but Trendyol integration is disabled.');
      return res.status(200).json({
        success: false,
        message: 'خدمة متجر ترينديول معطلة مؤقتاً.',
      });
    }

    const body = req.body;

    const payload: IncomingOrderPayload = {
      storeOrderId: `TRN-${body.orderNumber || body.id || Date.now()}`,
      storeType: 'TRENDYOL',
      customerName: body.customerFirstName
        ? `${body.customerFirstName} ${body.customerLastName || ''}`.trim()
        : 'عميل ترينديول',
      customerPhone: formatZatcaPhone(body.customerPhone || body.shipmentAddress?.phone) || '',
      customerEmail: body.customerEmail || null,
      shippingAddress: [
        body.shipmentAddress?.address1,
        body.shipmentAddress?.city,
        body.shipmentAddress?.district,
      ]
        .filter(Boolean)
        .join(', ') || null,
      paymentMethod: 'trendyol_prepaid', // ترينديول دائماً يدفع العميل مسبقاً (Prepaid)
      items: (body.lines || body.items || []).map((item: any) => ({
        sku: item.merchantSku || item.sku || '',
        barcode: item.barcode || null,
        productName: item.productName || item.name || 'صنف ترينديول',
        quantity: item.quantity || 1,
        unitPrice: parseFloat(item.price || item.unitPrice || 0),
        discount: parseFloat(item.discount || 0),
        taxPercentage: parseFloat(item.vatRate || 15),
        lineTotal: parseFloat(item.amount || item.lineTotal || 0),
      })),
      subtotal: parseFloat(body.totalPrice || body.subtotal || 0),
      shippingFee: parseFloat(body.shippingCost || 0),
      discountAmount: parseFloat(body.totalDiscount || 0),
      taxAmount: parseFloat(body.totalTax || 0),
      totalAmount: parseFloat(body.grossAmount || body.totalPrice || 0),
      orderDate: body.orderDate || new Date().toISOString(),
      rawOrderData: body,
    };

    const order = await orderService.handleIncomingOrder(payload);

    res.status(200).json({
      success: true,
      message: 'تم استلام طلب ترينديول بنجاح',
      orderId: order.id,
      status: order.status,
    });
  });
}
