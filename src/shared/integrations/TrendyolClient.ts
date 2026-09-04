import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { env } from '../../config/env';
import { AppError, UnauthorizedError, ValidationError, NotFoundError } from '../errors';
import { logger } from '../helpers/logger';

export interface TrendyolProductItem {
  barcode: string;
  title: string;
  productMainId: string;
  brandId: number;
  categoryId: number;
  quantity: number;
  stockCode: string;
  dimensionalWeight: number;
  description: string;
  currencyType?: string;
  listPrice: number;
  salePrice: number;
  vatRate: number;
  cargoCompanyId?: number;
  images: Array<{ url: string }>;
  attributes?: Array<{
    attributeId: number;
    attributeValueId?: number;
    customAttributeValue?: string;
  }>;
}

export interface TrendyolInventoryUpdateItem {
  barcode: string;
  quantity: number;
  salePrice: number;
  listPrice: number;
}

export class TrendyolClient {
  private client: AxiosInstance;
  private supplierId: string;

  constructor(baseURL?: string, supplierId?: string, apiKey?: string, apiSecret?: string) {
    this.supplierId = supplierId || env.trendyol.supplierId;
    const key = apiKey || env.trendyol.apiKey;
    const secret = apiSecret || env.trendyol.apiSecret;
    const authHeader = `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}`;

    this.client = axios.create({
      baseURL: baseURL || env.trendyol.baseUrl,
      headers: {
        Authorization: authHeader,
        'User-Agent': `${this.supplierId} - RahmaSyncHub`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 20000,
    });
  }

  /**
   * Central request handler with error wrapping and logging
   */
  private async request<T>(config: AxiosRequestConfig): Promise<T> {
    try {
      const response = await this.client.request<T>(config);
      return response.data;
    } catch (error: any) {
      if (error.response) {
        const status = error.response.status;
        const data = error.response.data;
        const message = data?.message || data?.errors?.[0]?.message || error.message;

        logger.error(`[TrendyolClient] Request failed (${status}):`, message);

        if (status === 401 || status === 403) {
          throw new UnauthorizedError('فشل الاتصال بمنصة ترينديول: بيانات الاعتماد غير صالحة');
        }
        if (status === 400 || status === 422) {
          throw new ValidationError(`خطأ في بيانات المنتج لدى ترينديول: ${message}`, data?.errors || []);
        }
        if (status === 404) {
          throw new NotFoundError('الطلب أو المنتج غير موجود في منصة ترينديول');
        }
        throw new AppError(`خطأ من خادم ترينديول (${status}): ${message}`, status);
      }

      logger.error('[TrendyolClient] Network or timeout error:', error.message);
      throw new AppError(`تعذر الاتصال بخادم ترينديول: ${error.message}`, 503);
    }
  }

  /**
   * Publish/Create products in Trendyol in Batch
   */
  public async createProducts(items: TrendyolProductItem[]): Promise<{ batchRequestId: string }> {
    return this.request<{ batchRequestId: string }>({
      method: 'POST',
      url: `/suppliers/${this.supplierId}/v2/products`,
      data: { items },
    });
  }

  /**
   * Update price and inventory in Trendyol
   */
  public async updatePriceAndInventory(items: TrendyolInventoryUpdateItem[]): Promise<{ batchRequestId: string }> {
    return this.request<{ batchRequestId: string }>({
      method: 'POST',
      url: `/suppliers/${this.supplierId}/products/price-and-inventory`,
      data: { items },
    });
  }

  /**
   * Check batch request processing status
   */
  public async checkBatchStatus(batchRequestId: string): Promise<any> {
    return this.request({
      method: 'GET',
      url: `/suppliers/${this.supplierId}/products/batch-requests/${batchRequestId}`,
    });
  }

  /**
   * Get list of brands from Trendyol
   */
  public async getBrands(name?: string): Promise<any> {
    return this.request({
      method: 'GET',
      url: '/brands',
      params: name ? { name } : undefined,
    });
  }
}

export const trendyolClient = new TrendyolClient();
