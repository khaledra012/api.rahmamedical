import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { env } from '../../config/env';
import { AppError, UnauthorizedError, ValidationError, NotFoundError } from '../errors';
import { logger } from '../helpers/logger';

export interface ZidProductPayload {
  name: {
    ar: string;
    en?: string;
  };
  sku: string;
  barcode?: string | null;
  price: number;
  cost?: number | null;
  sale_price?: number | null;
  weight?: number | null;
  is_taxable?: boolean;
  description?: {
    ar?: string;
    en?: string;
  };
  categories?: number[];
  images?: Array<{ image: string }>;
  stocks?: Array<{
    location_id: string;
    quantity: number;
  }>;
}

export class ZidClient {
  private client: AxiosInstance;

  constructor(baseURL?: string, token?: string, storeId?: string) {
    this.client = axios.create({
      baseURL: baseURL || env.zid.baseUrl,
      headers: {
        Authorization: `Bearer ${token || env.zid.token}`,
        'X-Manager-Token': token || env.zid.token,
        'Store-Id': storeId || env.zid.storeId,
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
        const message = data?.message || error.message;

        logger.error(`[ZidClient] Request failed (${status}):`, message);

        if (status === 401 || status === 403) {
          throw new UnauthorizedError('فشل الاتصال بمنصة زد: رمز التحقق غير صالح أو انتهت صلاحيته');
        }
        if (status === 422 || status === 400) {
          throw new ValidationError(
            `خطأ في بيانات المنتج لدى زد: ${message}`,
            data?.errors || []
          );
        }
        if (status === 404) {
          throw new NotFoundError('المنتج المطلوب غير موجود في متجر زد');
        }
        throw new AppError(`خطأ من خادم زد (${status}): ${message}`, status);
      }

      logger.error('[ZidClient] Network or timeout error:', error.message);
      throw new AppError(`تعذر الاتصال بخادم زد: ${error.message}`, 503);
    }
  }

  /**
   * Publish new product to Zid store
   */
  public async createProduct(payload: ZidProductPayload): Promise<any> {
    return this.request({
      method: 'POST',
      url: '/products',
      data: payload,
    });
  }

  /**
   * Update existing product in Zid store
   */
  public async updateProduct(zidProductId: string, payload: Partial<ZidProductPayload>): Promise<any> {
    return this.request({
      method: 'PATCH',
      url: `/products/${zidProductId}`,
      data: payload,
    });
  }

  /**
   * Get store categories from Zid
   */
  public async getCategories(): Promise<any> {
    return this.request({
      method: 'GET',
      url: '/managers/store/categories',
    });
  }

  /**
   * Update inventory stock for a product in Zid
   */
  public async updateStock(zidProductId: string, quantity: number, locationId: string = 'default-location'): Promise<any> {
    return this.request({
      method: 'PATCH',
      url: `/products/${zidProductId}`,
      data: {
        stocks: [
          {
            location_id: locationId,
            quantity,
          },
        ],
      },
    });
  }

  /**
   * Get recent orders from Zid store (for polling / reconciliation)
   */
  public async getOrders(page: number = 1, perPage: number = 20, status?: string): Promise<any> {
    return this.request({
      method: 'GET',
      url: '/managers/store/orders',
      params: {
        page,
        per_page: perPage,
        ...(status ? { status } : {}),
      },
    });
  }
}

export const zidClient = new ZidClient();
