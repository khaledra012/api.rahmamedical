import { daftraClient } from '../../../shared/integrations/DaftraClient';
import { productService } from './ProductService';
import { Product } from '../models/Product';
import { SyncLog } from '../models/SyncLog';
import { SystemSetting } from '../../../shared/models/SystemSetting';
import { logger } from '../../../shared/helpers/logger';

export class ProductPollerService {
  private timer: NodeJS.Timeout | null = null;
  private isPolling = false;
  private lastPollTime: Date | null = null;

  /**
   * تشغيل فاحص المنتجات الدوري كل 5 دقائق
   */
  public startPolling(intervalMinutes: number = 5): void {
    if (this.timer) {
      logger.warn('[ProductPoller] Poller is already running.');
      return;
    }

    const intervalMs = intervalMinutes * 60 * 1000;
    logger.info(`[ProductPoller] Starting background product poller every ${intervalMinutes} minutes.`);

    this.timer = setInterval(async () => {
      await this.pollProductsNow();
    }, intervalMs);
  }

  /**
   * إيقاف الفاحص الدوري
   */
  public stopPolling(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info('[ProductPoller] Background product poller stopped.');
    }
  }

  /**
   * جلب المنتجات المحدثة في آخر 5 دقائق من دفترة ومعالجتها آلياً
   */
  public async pollProductsNow(forceFromBaseline: boolean = false): Promise<{ processedCount: number; errorsCount: number }> {
    if (this.isPolling) {
      logger.warn('[ProductPoller] Product poll already in progress. Skipping concurrent run.');
      return { processedCount: 0, errorsCount: 0 };
    }

    this.isPolling = true;
    let processedCount = 0;
    let errorsCount = 0;
    let lastSuccessfulEventTime: Date | null = null;
    let hasItemFailure = false;
    const startTime = Date.now();

    try {
      // 1. استرجاع نقطة البداية الصفرية للنظام (Baseline Watermark)
      const baselineDate = await SystemSetting.getOrCreateBaselineDate();

      // 2. استرجاع وقت آخر فحص ناجح محفوظ في قاعدة البيانات
      const lastPolledStr = forceFromBaseline ? null : await SystemSetting.getValue('products_last_polled_at');
      const lastPolledDate = lastPolledStr ? new Date(lastPolledStr) : baselineDate;

      // 3. نافذة الفحص: آخر فحص مع دقيقة أمان إضافية، بشرط ألا تسبق تاريخ تشغيل النظام أبداً
      const calculatedStart = new Date(lastPolledDate.getTime() - 60 * 1000);
      const windowStart = calculatedStart < baselineDate ? baselineDate : calculatedStart;

      logger.info(
        `[ProductPoller] Checking Daftra for products updated since: ${windowStart.toLocaleTimeString()} (Baseline: ${baselineDate.toLocaleTimeString()})`
      );

      // 1. استدعاء API دفترة لجلب أحدث المنتجات المعدلة مرتبة من الأحدث للأقدم
      let page = 1;
      const limit = 50;
      let hasMore = true;
      const candidateProducts: any[] = [];

      // التكرار عبر الصفحات حتى نصل لأول منتج قديم (يدعم التحديثات الجماعية عبر Excel حتى آلاف الأصناف)
      while (hasMore && page <= 100) {
        const daftraRes: any = await daftraClient.getProducts(page, limit, 'updated');
        const rawProducts: any[] = Array.isArray(daftraRes?.data) ? daftraRes.data : [];

        if (rawProducts.length === 0) {
          hasMore = false;
          break;
        }

        let reachedOlderProducts = false;

        for (const item of rawProducts) {
          const productPayload = item.Product || item;
          if (productPayload && productPayload.id) {
            // أمان مضاعف: التوقف فوراً إذا كان تاريخ التعديل أقدم من نافذة الفحص أو تاريخ تشغيل النظام
            const rawTimestamp =
              productPayload.modified ||
              productPayload.updated ||
              productPayload.updated_at ||
              productPayload.created ||
              productPayload.created_at;

            let itemDate: Date | null = null;
            if (rawTimestamp) {
              const isoLike = String(rawTimestamp).includes('T')
                ? String(rawTimestamp)
                : String(rawTimestamp).replace(' ', 'T') + '+03:00';
              const parsed = new Date(isoLike);
              if (!isNaN(parsed.getTime())) {
                itemDate = parsed;
              }
            }

            if (itemDate && (itemDate < windowStart || itemDate < baselineDate)) {
              reachedOlderProducts = true;
              break;
            }

            candidateProducts.push({ payload: productPayload, timestamp: itemDate || rawTimestamp });
          }
        }

        // إذا وصلنا لمنتجات أقدم من آخر 5 دقائق أو انتهت الصفحات نتوقف فوراً
        if (reachedOlderProducts || rawProducts.length < limit) {
          hasMore = false;
        } else {
          page++;
          // تأخير زمني بسيط (250ms) لتفادي حدود الطلبات (Rate Limit 429) من خادم دفترة عند تصفح صفحات متتالية
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
      }

      // ترتيب المنتجات زمنياً من الأقدم للأحدث (Ascending) لضمان تسلسل الأحداث وتحديث الـ Watermark تدريجياً
      candidateProducts.sort((a, b) => {
        const timeA = new Date(a.timestamp || 0).getTime();
        const timeB = new Date(b.timestamp || 0).getTime();
        return timeA - timeB;
      });

      for (const item of candidateProducts) {
        try {
          await productService.handleIncomingWebhook(item.payload);
          processedCount++;

          if (item.timestamp) {
            const validDate = item.timestamp instanceof Date ? item.timestamp : new Date(item.timestamp);
            if (!isNaN(validDate.getTime())) {
              lastSuccessfulEventTime = validDate;
            }
          }
        } catch (itemErr: any) {
          hasItemFailure = true;
          errorsCount++;
          logger.error(`[ProductPoller] Error processing product #${item.payload.id}: ${itemErr.message}`);
          // التوقف عند أول فشل حتى ترتكز نقطة التوقف عند تاريخ آخر عنصر نجح قبله
          break;
        }
      }

      const durationMs = Date.now() - startTime;

      // تطبيق نفس معيار سجل العمليات النظيف:
      // لا نسجل في sync_logs إلا إذا تمت معالجة أصناف فعلية، دون إدراج أسطر روتينية فارغة
      if (processedCount > 0) {
        logger.info(`[ProductPoller] Processed ${processedCount} products in ${durationMs}ms.`);
      } else {
        logger.info(`[ProductPoller] Routine check finished in ${durationMs}ms. No products changed.`);
      }
    } catch (error: any) {
      errorsCount++;
      const durationMs = Date.now() - startTime;
      logger.error(`[ProductPoller] Error during product poll: ${error.message}`);

      // توثيق الخطأ في السجل عند حدوث فشل حقيقي في الاتصال لإنذار المستخدم
      await SyncLog.create({
        entityType: 'PRODUCT',
        entityId: null,
        action: 'UPDATE',
        direction: 'DAFTRA_TO_ZID',
        source: 'POLLER',
        requestUrl: 'products/poll',
        requestMethod: 'GET',
        status: 'FAILED',
        errorMessage: `فشل الفحص الدوري لمنتجات دفترة: ${error.message}`,
        durationMs,
      });
    } finally {
      this.isPolling = false;
      this.lastPollTime = new Date(startTime);
      try {
        if (hasItemFailure) {
          if (lastSuccessfulEventTime) {
            // حدث فشل جزئي: نحدّث نقطة التوقف إلى تاريخ آخر منتج نجحت معالجته بالفعل (Event Timestamp)
            await SystemSetting.setValue('products_last_polled_at', lastSuccessfulEventTime.toISOString());
            logger.info(`[ProductPoller] Partial failure encountered. Watermark set to last successful product event: ${lastSuccessfulEventTime.toISOString()}`);
          } else {
            logger.warn('[ProductPoller] First product failed. Watermark retained at previous checkpoint.');
          }
        } else if (errorsCount === 0) {
          // نجحت كافة المنتجات بدون أي أخطاء: يتقدم الـ watermark إلى وقت بدء الفحص الحالي
          await SystemSetting.setValue('products_last_polled_at', new Date(startTime).toISOString());
        }
      } catch (dbErr: any) {
        logger.warn('[ProductPoller] Could not persist products_last_polled_at to DB:', dbErr.message);
      }
    }

    return { processedCount, errorsCount };
  }
}

export const productPollerService = new ProductPollerService();
