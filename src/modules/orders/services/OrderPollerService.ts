import { orderService } from './OrderService';
import { env } from '../../../config/env';
import { zidClient } from '../../../shared/integrations/ZidClient';
import { logger, extractAddressDetails, formatZatcaPhone } from '../../../shared/helpers';
import { SyncLog } from '../../products/models/SyncLog';
import { SystemSetting } from '../../../shared/models/SystemSetting';

export class OrderPollerService {
  private timer: NodeJS.Timeout | null = null;
  private isPolling = false;
  private lastPollTime: Date | null = null;

  /**
   * تشغيل الفاحص الدوري (كل 5 دقائق افتراضياً)
   */
  public startPolling(intervalMinutes: number = 5): void {
    if (this.timer) {
      logger.warn('[OrderPoller] Poller is already running.');
      return;
    }

    const intervalMs = intervalMinutes * 60 * 1000;
    logger.info(`[OrderPoller] Starting background order poller every ${intervalMinutes} minutes.`);

    this.timer = setInterval(async () => {
      await this.pollOrdersNow('POLLER');
    }, intervalMs);
  }

  /**
   * إيقاف الفاحص الدوري
   */
  public stopPolling(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info('[OrderPoller] Background order poller stopped.');
    }
  }

  /**
   * فحص وسحب الطلبات الجديدة الآن (يعمل للفاحص الدوري ولزر المزامنة اليدوي بالداشبورد)
   */
  public async pollOrdersNow(source: 'POLLER' | 'MANUAL' = 'MANUAL'): Promise<{
    processedCount: number;
    skippedCount: number;
    errorsCount: number;
  }> {
    if (this.isPolling) {
      logger.warn('[OrderPoller] Poll already in progress. Skipping concurrent run.');
      return { processedCount: 0, skippedCount: 0, errorsCount: 0 };
    }

    this.isPolling = true;
    let processedCount = 0;
    let skippedCount = 0;
    let errorsCount = 0;
    let lastSuccessfulEventTime: Date | null = null;
    let hasItemFailure = false;

    const startTime = Date.now();
    logger.info(`[OrderPoller] Starting order poll (source: ${source})...`);

    try {
      // 1. استرجاع نقطة البداية الصفرية للنظام (Baseline Watermark)
      const baselineDate = await SystemSetting.getOrCreateBaselineDate();

      // 2. استرجاع وقت آخر فحص ناجح محفوظ في قاعدة البيانات
      const lastPolledStr = await SystemSetting.getValue('orders_last_polled_at');
      const lastPolledDate = lastPolledStr ? new Date(lastPolledStr) : baselineDate;

      // 3. نافذة الفحص: آخر فحص مع دقيقة أمان إضافية، بشرط ألا تسبق تاريخ تشغيل النظام أبداً
      const calculatedStart = new Date(lastPolledDate.getTime() - 60 * 1000);
      const windowStart = calculatedStart < baselineDate ? baselineDate : calculatedStart;

      logger.info(`[OrderPoller] Checking Zid for orders created since: ${windowStart.toLocaleTimeString()} (Baseline: ${baselineDate.toLocaleTimeString()})`);
      let page = 1;
      const perPage = 50;
      let hasMore = true;
      const candidateOrders: any[] = [];

      // التكرار عبر الصفحات حتى نصل لأول طلب قديم خارج النافذة
      while (hasMore && page <= 50) {
        const zidOrdersRes: any = await zidClient.getOrders(page, perPage);
        const rawOrders: any[] = Array.isArray(zidOrdersRes?.orders)
          ? zidOrdersRes.orders
          : Array.isArray(zidOrdersRes?.data)
          ? zidOrdersRes.data
          : [];

        if (rawOrders.length === 0) {
          hasMore = false;
          break;
        }

        let reachedOlderOrders = false;

        for (const rawOrder of rawOrders) {
          // أمان مضاعف: التوقف فوراً إذا كان الطلب أقدم من نافذة الفحص أو أقدم من تاريخ تشغيل النظام
          const orderDateStr = rawOrder.created_at || rawOrder.order_date || rawOrder.date;
          if (orderDateStr) {
            const orderDate = new Date(orderDateStr);
            if (!isNaN(orderDate.getTime()) && (orderDate < windowStart || orderDate < baselineDate)) {
              reachedOlderOrders = true;
              break;
            }
          }
          candidateOrders.push(rawOrder);
        }

        // إذا وصلنا لطلبات أقدم من النافذة أو انتهت النتائج بالصفحة الحالية نتوقف فوراً
        if (reachedOlderOrders || rawOrders.length < perPage) {
          hasMore = false;
        } else {
          page++;
          // تأخير زمني بسيط (250ms) لتفادي حدود الطلبات (Rate Limit 429) من خادم زد عند تصفح صفحات متتالية
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
      }

      // ترتيب الطلبات زمنياً من الأقدم للأحدث (Ascending) لضمان تسلسل الأحداث وتحديث الـ Watermark تدريجياً
      candidateOrders.sort((a, b) => {
        const timeA = new Date(a.created_at || a.order_date || a.date || 0).getTime();
        const timeB = new Date(b.created_at || b.order_date || b.date || 0).getTime();
        return timeA - timeB;
      });

      for (const rawOrder of candidateOrders) {
        try {
          let detailedOrder = rawOrder;
          if ((!rawOrder.products || rawOrder.products.length === 0) && (!rawOrder.items || rawOrder.items.length === 0)) {
            try {
              const fullDetails = await zidClient.getOrderDetails(rawOrder.id);
              if (fullDetails?.order) {
                detailedOrder = fullDetails.order;
              }
            } catch (err: any) {
              logger.warn(`[OrderPoller] Could not fetch detailed order for #${rawOrder.id}: ${err.message}`);
            }
          }

          const rawItems = detailedOrder.products || detailedOrder.items || detailedOrder.order_items || [];
          const items = rawItems.map((item: any) => {
            const p = item.product || {};
            return {
              sku: item.sku || p.sku || item.product_sku || '',
              barcode: item.barcode || p.barcode || null,
              productName: item.name || p.name || item.product_name || 'صنف',
              quantity: parseInt(item.quantity as any, 10) || 1,
              unitPrice: parseFloat(item.price || item.unit_price || 0),
              discount: parseFloat(item.discount || 0),
              taxPercentage: parseFloat(item.tax_percent || item.tax_percentage || 15),
              lineTotal: parseFloat(item.total || item.line_total || 0),
            };
          });

          const paymentMethodCode =
            detailedOrder.payment?.method?.code ||
            (typeof detailedOrder.payment?.method === 'string' ? detailedOrder.payment.method : null) ||
            detailedOrder.payment_method?.code ||
            (typeof detailedOrder.payment_method === 'string' ? detailedOrder.payment_method : null) ||
            detailedOrder.payments?.[0]?.code ||
            detailedOrder.payment?.method?.name ||
            detailedOrder.payment_method_name ||
            'unknown';

          const detailedPaymentInvoice = Array.isArray(detailedOrder.payment?.invoice)
            ? detailedOrder.payment.invoice
            : [];
          const zidShippingItem = detailedPaymentInvoice.find((entry: any) => entry.code === 'shipping');
          const zidCodItem = detailedPaymentInvoice.find((entry: any) => entry.code === 'zid_cod' || entry.code === 'cod');
          const zidCouponItem = detailedPaymentInvoice.find((entry: any) => entry.code === 'coupon' || entry.code === 'discount');

          const rawCouponVal =
            zidCouponItem?.value ||
            detailedOrder.coupon?.discount ||
            (Array.isArray(detailedOrder.coupons) && detailedOrder.coupons[0]?.discount) ||
            detailedOrder.discount ||
            detailedOrder.discount_amount ||
            detailedOrder.total_discount ||
            0;

          const discountAmount = Math.abs(parseFloat(String(rawCouponVal || 0)));

          const addressInfo = extractAddressDetails(detailedOrder.shipping, detailedOrder.shipping_address);

          const payload = {
            storeOrderId: `ZID-${detailedOrder.id || detailedOrder.order_id || detailedOrder.code}`,
            storeType: 'ZID' as const,
            customerName:
              detailedOrder.customer?.name ||
              (detailedOrder.customer?.first_name ? `${detailedOrder.customer.first_name} ${detailedOrder.customer.last_name || ''}`.trim() : null) ||
              detailedOrder.shipping?.name ||
              detailedOrder.shipping_address?.name ||
              'عميل زد',
            customerPhone:
              formatZatcaPhone(
                detailedOrder.customer?.mobile ||
                detailedOrder.customer?.phone ||
                detailedOrder.shipping?.phone ||
                detailedOrder.shipping_address?.phone
              ) || '',
            customerEmail: detailedOrder.customer?.email || null,
            shippingAddress: addressInfo.fullAddress,
            paymentMethod: String(paymentMethodCode).toLowerCase(),
            items,
            subtotal: parseFloat(detailedOrder.sub_total || detailedOrder.subtotal || 0),
            shippingFee:
              parseFloat(
                zidShippingItem?.value ||
                detailedOrder.shipping_cost ||
                detailedOrder.shipping_fee ||
                detailedOrder.shipping?.cost ||
                0
              ) + parseFloat(zidCodItem?.value || detailedOrder.cod_cost || detailedOrder.cod_fee || 0),
            discountAmount,
            taxAmount: parseFloat(detailedOrder.tax_amount || detailedOrder.tax || 0),
            totalAmount: parseFloat(detailedOrder.total || detailedOrder.total_amount || detailedOrder.order_total || 0),
            orderDate: detailedOrder.created_at || detailedOrder.order_date || detailedOrder.date || new Date().toISOString(),
            rawOrderData: detailedOrder,
          };

          await orderService.handleIncomingOrder(payload);
          processedCount++;

          const validEventDate = new Date(payload.orderDate);
          if (!isNaN(validEventDate.getTime())) {
            lastSuccessfulEventTime = validEventDate;
          }
        } catch (itemErr: any) {
          hasItemFailure = true;
          skippedCount++;
          logger.warn(`[OrderPoller] Skipped order processing: ${itemErr.message}`);
          // التوقف عند أول فشل حتى ترتكز نقطة التوقف (Watermark) عند تاريخ آخر عنصر نجح قبله
          break;
        }
      }

      // 2. فحص طلبات ترينديول الجديدة (Trendyol Orders Fetch - يتم تخطيه إذا كان المتجر معطلاً)
      if (env.enableTrendyol) {
        logger.info('[OrderPoller] Checking Trendyol for new orders...');
      } else {
        logger.info('[OrderPoller] Trendyol polling skipped (integration is disabled).');
      }

      const durationMs = Date.now() - startTime;

      // لا نسجل في sync_logs إلا إذا تمت معالجة طلبات فعلية لتفادي ملء السجل بأسطر روتينية فارغة
      if (processedCount > 0) {
        logger.info(`[OrderPoller] Order poll completed in ${durationMs}ms. (Processed: ${processedCount}, Skipped: ${skippedCount})`);
      } else {
        logger.info(`[OrderPoller] Routine check finished in ${durationMs}ms. No pending orders found.`);
      }
    } catch (error: any) {
      errorsCount++;
      logger.error(`[OrderPoller] Error during order poll: ${error.message}`);

      // توثيق الخطأ في السجل إذا حدث فشل حقيقي في الاتصال
      await SyncLog.create({
        entityType: 'ORDER',
        entityId: null,
        action: 'UPDATE',
        direction: 'ZID_TO_DAFTRA',
        source: source === 'POLLER' ? 'POLLER' : 'MANUAL',
        requestUrl: 'stores/orders/poll',
        requestMethod: 'GET',
        status: 'FAILED',
        errorMessage: `فشل الفحص الدوري للطلبات: ${error.message}`,
        durationMs: Date.now() - startTime,
      });
    } finally {
      this.isPolling = false;
      this.lastPollTime = new Date(startTime);
      try {
        if (hasItemFailure) {
          if (lastSuccessfulEventTime) {
            // حدث فشل جزئي: نحدّث نقطة التوقف إلى تاريخ آخر طلب نجحت معالجته بالفعل (Event Timestamp)
            await SystemSetting.setValue('orders_last_polled_at', lastSuccessfulEventTime.toISOString());
            logger.info(`[OrderPoller] Partial failure encountered. Watermark set to last successful order event: ${lastSuccessfulEventTime.toISOString()}`);
          } else {
            logger.warn('[OrderPoller] First order failed. Watermark retained at previous checkpoint.');
          }
        } else if (errorsCount === 0) {
          // نجحت كافة الطلبات بدون أي أخطاء: يتقدم الـ watermark إلى وقت بدء الفحص الحالي
          await SystemSetting.setValue('orders_last_polled_at', new Date(startTime).toISOString());
        }
      } catch (dbErr: any) {
        logger.warn('[OrderPoller] Could not persist orders_last_polled_at to DB:', dbErr.message);
      }
    }

    return { processedCount, skippedCount, errorsCount };
  }
}

export const orderPollerService = new OrderPollerService();
