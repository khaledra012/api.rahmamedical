import { Op } from 'sequelize';
import { Product } from '../models/Product';
import { ProductMapping } from '../models/ProductMapping';
import { SyncLog } from '../models/SyncLog';
import { zidClient, ZidProductPayload } from '../../../shared/integrations/ZidClient';
import { trendyolClient, TrendyolProductItem } from '../../../shared/integrations/TrendyolClient';
import {
  DaftraWebhookProductPayload,
  ProductEnrichDto,
  ProductFilters,
} from '../dtos/product.dtos';
import { NotFoundError, ConflictError, AppError } from '../../../shared/errors';
import { logger } from '../../../shared/helpers/logger';
import { env } from '../../../config/env';

export class ProductService {
  /**
   * 1. Ingest Webhook from Daftra with Idempotency Support
   */
  public async handleIncomingWebhook(payload: DaftraWebhookProductPayload): Promise<Product> {
    const daftraProductId = payload.id;
    if (!daftraProductId) {
      throw new AppError('بيانات المنتج غير صالحة: معرّف دفترة مفقود', 400);
    }

    const sku = payload.product_code || `SKU-${daftraProductId}`;
    const nameAr = payload.name || `منتج رقم ${daftraProductId}`;
    const price = parseFloat(payload.unit_price as any) || 0.0;
    const costPrice =
      payload.cost !== undefined && payload.cost !== null
        ? parseFloat(payload.cost as any)
        : payload.buy_price !== undefined && payload.buy_price !== null
        ? parseFloat(payload.buy_price as any)
        : null;
    const salePrice = payload.discount_price !== undefined ? parseFloat(payload.discount_price as any) : null;
    const stockQuantity = parseInt(payload.stock_balance as any) || 0;
    const daftraStorehouseId = payload.storehouse_id ? parseInt(payload.storehouse_id as any) : null;
    const weight = payload.weight !== undefined ? parseFloat(payload.weight as any) : null;
    const isTaxable = Boolean(payload.is_taxable);
    const taxPercentage = payload.tax_percentage !== undefined ? parseFloat(payload.tax_percentage as any) : null;

    let product = await Product.findOne({ where: { daftraProductId } });

    if (product) {
      product.nameAr = nameAr;
      product.sku = sku;
      if (payload.barcode) product.barcode = payload.barcode;
      if (payload.description) product.descriptionAr = payload.description;
      product.price = price;
      product.costPrice = costPrice;
      product.salePrice = salePrice;
      product.stockQuantity = stockQuantity;
      product.daftraStorehouseId = daftraStorehouseId;
      product.weight = weight;
      product.isTaxable = isTaxable;
      product.taxPercentage = taxPercentage;
      product.daftraCategory = payload.category_name || product.daftraCategory;
      product.rawDaftraData = payload;

      await product.save();
      logger.info(`[ProductService] Updated existing Daftra product #${daftraProductId} (${sku})`);

      const mapping = await ProductMapping.findOne({ where: { productId: product.id } });
      const currentProductId = product.id;
      if (mapping && mapping.zidProductId && mapping.syncStatus === 'SYNCED') {
        this.syncUpdateToZid(product, mapping.zidProductId).catch((err) => {
          logger.error(`[ProductService] Auto-sync update to Zid failed for #${currentProductId}:`, err);
        });
      }
      if (mapping && mapping.trendyolStatus === 'SYNCED') {
        this.syncUpdateToTrendyol(product).catch((err) => {
          logger.error(`[ProductService] Auto-sync update to Trendyol failed for #${currentProductId}:`, err);
        });
      }
    } else {
      product = await Product.create({
        daftraProductId,
        sku,
        barcode: payload.barcode || null,
        nameAr,
        descriptionAr: payload.description || null,
        price,
        costPrice,
        salePrice,
        stockQuantity,
        daftraStorehouseId,
        weight,
        isTaxable,
        taxPercentage,
        daftraCategory: payload.category_name || null,
        publishStatus: 'PENDING_REVIEW',
        trendyolStatus: 'PENDING_REVIEW',
        rawDaftraData: payload,
      });

      await ProductMapping.create({
        productId: product.id,
        daftraProductId,
        sku,
        barcode: payload.barcode || null,
        syncStatus: 'PENDING',
        trendyolStatus: 'PENDING',
      });

      logger.info(`[ProductService] Ingested new Daftra product #${daftraProductId} (${sku})`);
    }

    return product;
  }

  /**
   * 2. Enrich Product with Marketing, Zid & Trendyol details
   */
  public async enrichProduct(productId: number, dto: ProductEnrichDto): Promise<Product> {
    const product = await Product.findByPk(productId);
    if (!product) {
      throw new NotFoundError('المنتج المطلوب غير موجود');
    }

    if (dto.name_en !== undefined) product.nameEn = dto.name_en;
    if (dto.description_ar !== undefined) product.descriptionAr = dto.description_ar;
    if (dto.description_en !== undefined) product.descriptionEn = dto.description_en;
    if (dto.zid_category_ids !== undefined) product.zidCategoryIds = dto.zid_category_ids;
    if (dto.trendyol_category_id !== undefined) product.trendyolCategoryId = dto.trendyol_category_id;
    if (dto.trendyol_brand_id !== undefined) product.trendyolBrandId = dto.trendyol_brand_id;
    if (dto.images !== undefined) product.images = dto.images;
    if (dto.seo_keywords !== undefined) product.seoKeywords = dto.seo_keywords;

    await product.save();
    return product;
  }

  /**
   * 3. Publish Product to Zid
   */
  public async publishToZid(productId: number): Promise<{ product: Product; zidProductId: string }> {
    const product = await Product.findByPk(productId);
    if (!product) {
      throw new NotFoundError('المنتج غير موجود');
    }

    if (product.publishStatus === 'PUBLISHING') {
      throw new ConflictError('المنتج قيد النشر بالفعل لمتجر زد، يرجى الانتظار');
    }

    product.publishStatus = 'PUBLISHING';
    product.publishError = null;
    await product.save();

    const startTime = Date.now();
    let zidResponse: any = null;

    try {
      const payload: ZidProductPayload = {
        name: {
          ar: product.nameAr,
          en: product.nameEn || product.nameAr,
        },
        sku: product.sku,
        barcode: product.barcode || null,
        price: Number(product.price) || 0,
        cost: product.costPrice ? Number(product.costPrice) : null,
        sale_price: product.salePrice ? Number(product.salePrice) : null,
        weight: {
          value: product.weight ? Number(product.weight) : 0.1,
          unit: 'kg',
        },
        is_taxable: Boolean(product.isTaxable),
        requires_shipping: true,
        is_draft: false,
        is_published: true,
        quantity: product.stockQuantity || 0,
        description: {
          ar: product.descriptionAr || '',
          en: product.descriptionEn || '',
        },
        images: (product.images || []).map((url) => ({ image: url })),
      };

      zidResponse = await zidClient.createProduct(payload);
      const zidProductId = zidResponse?.id || zidResponse?.product?.id;

      if (!zidProductId) {
        throw new AppError('فشل الحصول على مُعرّف المنتج من منصة زد بعد الإرسال', 500);
      }

      const [mapping] = await ProductMapping.findOrCreate({
        where: { productId: product.id },
        defaults: {
          productId: product.id,
          daftraProductId: product.daftraProductId,
          sku: product.sku,
          barcode: product.barcode,
          syncStatus: 'SYNCED',
          zidProductId,
          lastSyncedAt: new Date(),
        },
      });

      mapping.zidProductId = zidProductId;
      mapping.syncStatus = 'SYNCED';
      mapping.lastSyncedAt = new Date();
      mapping.lastError = null;
      await mapping.save();

      product.publishStatus = 'PUBLISHED';
      product.publishError = null;
      await product.save();

      await SyncLog.create({
        entityType: 'PRODUCT',
        entityId: product.id,
        action: 'CREATE',
        direction: 'DAFTRA_TO_ZID',
        source: 'MANUAL',
        requestUrl: 'https://api.zid.sa/v1/products/',
        requestMethod: 'POST',
        requestPayload: payload,
        responseStatus: 201,
        responseBody: zidResponse,
        status: 'SUCCESS',
        durationMs: Date.now() - startTime,
      });

      logger.info(`[ProductService] Published Product #${product.id} to Zid (ID: ${zidProductId})`);
      return { product, zidProductId };
    } catch (error: any) {
      const errorMessage = error.message || 'فشل النشر لمتجر زد';
      product.publishStatus = 'FAILED';
      product.publishError = errorMessage;
      await product.save();

      const mapping = await ProductMapping.findOne({ where: { productId: product.id } });
      if (mapping) {
        mapping.syncStatus = 'FAILED';
        mapping.lastError = errorMessage;
        await mapping.save();
      }

      await SyncLog.create({
        entityType: 'PRODUCT',
        entityId: product.id,
        action: 'CREATE',
        direction: 'DAFTRA_TO_ZID',
        source: 'MANUAL',
        requestUrl: 'https://api.zid.sa/v1/products',
        requestMethod: 'POST',
        responseStatus: error.statusCode || 500,
        responseBody: error.details || null,
        errorMessage,
        status: 'FAILED',
        durationMs: Date.now() - startTime,
      });

      throw error;
    }
  }

  /**
   * 4. Publish Product to Trendyol
   */
  public async publishToTrendyol(productId: number): Promise<{ product: Product; batchRequestId: string }> {
    if (!env.enableTrendyol) {
      throw new AppError('خدمة متجر ترينديول معطلة مؤقتاً وسيتوفر قريباً.', 400);
    }

    const product = await Product.findByPk(productId);
    if (!product) {
      throw new NotFoundError('المنتج غير موجود');
    }

    if (product.trendyolStatus === 'PUBLISHING') {
      throw new ConflictError('المنتج قيد النشر بالفعل لمتجر ترينديول، يرجى الانتظار');
    }

    product.trendyolStatus = 'PUBLISHING';
    product.trendyolError = null;
    await product.save();

    const startTime = Date.now();
    try {
      const barcode = product.barcode || `BC-${product.daftraProductId}`;
      const item: TrendyolProductItem = {
        barcode,
        title: product.nameAr,
        productMainId: product.sku,
        brandId: product.trendyolBrandId || 1001,
        categoryId: product.trendyolCategoryId || 501,
        quantity: product.stockQuantity,
        stockCode: product.sku,
        dimensionalWeight: product.weight ? Number(product.weight) : 1,
        description: product.descriptionAr || product.nameAr,
        listPrice: Number(product.price),
        salePrice: product.salePrice ? Number(product.salePrice) : Number(product.price),
        vatRate: product.taxPercentage ? Number(product.taxPercentage) : 15,
        images: (product.images || []).map((url) => ({ url })),
      };

      const response = await trendyolClient.createProducts([item]);
      const batchRequestId = response.batchRequestId;

      const [mapping] = await ProductMapping.findOrCreate({
        where: { productId: product.id },
        defaults: {
          productId: product.id,
          daftraProductId: product.daftraProductId,
          sku: product.sku,
          barcode,
          syncStatus: 'PENDING',
          trendyolStatus: 'SYNCED',
          trendyolBatchRequestId: batchRequestId,
          lastSyncedTrendyolAt: new Date(),
        },
      });

      mapping.trendyolBatchRequestId = batchRequestId;
      mapping.trendyolStatus = 'SYNCED';
      mapping.lastSyncedTrendyolAt = new Date();
      mapping.lastTrendyolError = null;
      await mapping.save();

      product.trendyolStatus = 'PUBLISHED';
      product.trendyolError = null;
      await product.save();

      await SyncLog.create({
        entityType: 'PRODUCT',
        entityId: product.id,
        action: 'CREATE',
        direction: 'DAFTRA_TO_ZID',
        source: 'MANUAL',
        requestUrl: 'https://api.trendyol.com/sapigw/suppliers/products',
        requestMethod: 'POST',
        requestPayload: { items: [item] },
        responseStatus: 200,
        responseBody: response,
        status: 'SUCCESS',
        durationMs: Date.now() - startTime,
      });

      logger.info(`[ProductService] Published Product #${product.id} to Trendyol (Batch: ${batchRequestId})`);
      return { product, batchRequestId };
    } catch (error: any) {
      const errorMessage = error.message || 'فشل النشر لمتجر ترينديول';
      product.trendyolStatus = 'FAILED';
      product.trendyolError = errorMessage;
      await product.save();

      const mapping = await ProductMapping.findOne({ where: { productId: product.id } });
      if (mapping) {
        mapping.trendyolStatus = 'FAILED';
        mapping.lastTrendyolError = errorMessage;
        await mapping.save();
      }

      await SyncLog.create({
        entityType: 'PRODUCT',
        entityId: product.id,
        action: 'CREATE',
        direction: 'DAFTRA_TO_ZID',
        source: 'MANUAL',
        requestUrl: 'https://api.trendyol.com/sapigw/suppliers/products',
        requestMethod: 'POST',
        responseStatus: error.statusCode || 500,
        responseBody: error.details || null,
        errorMessage,
        status: 'FAILED',
        durationMs: Date.now() - startTime,
      });

      throw error;
    }
  }

  /**
   * 5. Publish Product to All Connected Stores (Zid + Trendyol)
   */
  public async publishToAllStores(productId: number): Promise<{ zid: any; trendyol: any }> {
    const zidResult = await this.publishToZid(productId);
    if (!env.enableTrendyol) {
      return { zid: zidResult, trendyol: { skipped: true, message: 'خدمة ترينديول معطلة مؤقتاً' } };
    }
    const trendyolResult = await this.publishToTrendyol(productId);
    return { zid: zidResult, trendyol: trendyolResult };
  }

  /**
   * 6. Smart Targeted Retry: Only retry the specific store that failed!
   */
  public async retryPublish(productId: number): Promise<{ product: Product; details: string }> {
    const product = await Product.findByPk(productId);
    if (!product) {
      throw new NotFoundError('المنتج غير موجود');
    }

    const failedOnZid = product.publishStatus === 'FAILED';
    const failedOnTrendyol = product.trendyolStatus === 'FAILED';

    const messages: string[] = [];

    // If Zid was the failed one, retry Zid ONLY
    if (failedOnZid) {
      await this.publishToZid(productId);
      messages.push('متجر زد');
    }

    // If Trendyol was the failed one, retry Trendyol ONLY
    if (failedOnTrendyol) {
      await this.publishToTrendyol(productId);
      messages.push('ترينديول');
    }

    // If neither specifically marked failed, retry any non-published store
    if (!failedOnZid && !failedOnTrendyol) {
      if (product.publishStatus !== 'PUBLISHED') {
        await this.publishToZid(productId);
        messages.push('متجر زد');
      }
      if (product.trendyolStatus !== 'PUBLISHED') {
        await this.publishToTrendyol(productId);
        messages.push('ترينديول');
      }
    }

    const updated = await Product.findByPk(productId);
    return {
      product: updated!,
      details: messages.length > 0 ? `تمت إعادة المحاولة لـ (${messages.join(' و ')}) بنجاح` : 'تمت إعادة المحاولة',
    };
  }

  /**
   * 7. Toggle pause product state
   */
  public async togglePauseProduct(productId: number): Promise<Product> {
    const product = await Product.findByPk(productId);
    if (!product) {
      throw new NotFoundError('المنتج غير موجود');
    }

    if (product.publishStatus === 'PAUSED') {
      product.publishStatus = 'PUBLISHED';
    } else if (product.publishStatus === 'PUBLISHED') {
      product.publishStatus = 'PAUSED';
    } else {
      throw new AppError('يمكن إيقاف أو تفعيل المنتجات المنشورة فقط', 400);
    }

    await product.save();
    return product;
  }

  /**
   * 8. Sync updates to Zid & Trendyol
   */
  private async syncUpdateToZid(product: Product, zidProductId: string): Promise<void> {
    const payload: Partial<ZidProductPayload> = {
      name: { ar: product.nameAr, en: product.nameEn || product.nameAr },
      price: Number(product.price),
      cost: product.costPrice ? Number(product.costPrice) : null,
      stocks: [{ location_id: 'default-location', quantity: product.stockQuantity }],
    };
    await zidClient.updateProduct(zidProductId, payload);
  }

  private async syncUpdateToTrendyol(product: Product): Promise<void> {
    if (!env.enableTrendyol) return;
    const barcode = product.barcode || `BC-${product.daftraProductId}`;
    await trendyolClient.updatePriceAndInventory([
      {
        barcode,
        quantity: product.stockQuantity,
        salePrice: product.salePrice ? Number(product.salePrice) : Number(product.price),
        listPrice: Number(product.price),
      },
    ]);
  }

  /**
   * 9. Get paginated products list with filters
   */
  public async getProducts(filters: ProductFilters = {}): Promise<{
    products: Product[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const page = Math.max(1, Number(filters.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(filters.limit) || 20));
    const offset = (page - 1) * limit;

    const where: any = {};

    if (filters.status && filters.status !== 'ALL') {
      where.publishStatus = filters.status;
    }

    if (filters.search && filters.search.trim()) {
      const query = `%${filters.search.trim()}%`;
      where[Op.or] = [
        { nameAr: { [Op.like]: query } },
        { nameEn: { [Op.like]: query } },
        { sku: { [Op.like]: query } },
        { barcode: { [Op.like]: query } },
      ];
    }

    const { rows: products, count: total } = await Product.findAndCountAll({
      where,
      limit,
      offset,
      order: [['createdAt', 'DESC']],
    });

    return {
      products,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * 10. Get single product by ID
   */
  public async getProductById(productId: number): Promise<{ product: Product; mapping: ProductMapping | null }> {
    const product = await Product.findByPk(productId);
    if (!product) {
      throw new NotFoundError('المنتج المطلوب غير موجود');
    }

    const mapping = await ProductMapping.findOne({ where: { productId: product.id } });
    return { product, mapping };
  }

  /**
   * 11. Real Dashboard Stats
   */
  public async getDashboardStats(): Promise<{
    totalProducts: number;
    publishedProducts: number;
    pendingProducts: number;
    failedProducts: number;
    pausedProducts: number;
    publishedRatio: number;
    recentLogs: any[];
  }> {
    const totalProducts = await Product.count();
    const publishedProducts = await Product.count({ where: { publishStatus: 'PUBLISHED' } });
    const pendingProducts = await Product.count({ where: { publishStatus: 'PENDING_REVIEW' } });
    const failedProducts = await Product.count({ where: { publishStatus: 'FAILED' } });
    const pausedProducts = await Product.count({ where: { publishStatus: 'PAUSED' } });

    const publishedRatio = totalProducts > 0 ? Math.round((publishedProducts / totalProducts) * 100) : 0;

    const recentLogs = await SyncLog.findAll({
      limit: 6,
      order: [['createdAt', 'DESC']],
    });

    return {
      totalProducts,
      publishedProducts,
      pendingProducts,
      failedProducts,
      pausedProducts,
      publishedRatio,
      recentLogs,
    };
  }
}

export const productService = new ProductService();
