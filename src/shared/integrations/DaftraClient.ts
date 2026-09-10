import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { env } from '../../config/env';
import { AppError, UnauthorizedError, NotFoundError } from '../errors';
import { logger } from '../helpers/logger';

export class DaftraClient {
  private client: AxiosInstance;

  constructor(baseURL?: string, apiKey?: string) {
    this.client = axios.create({
      baseURL: baseURL || env.daftra.baseUrl,
      headers: {
        'apikey': apiKey || env.daftra.apiKey,
        'API-KEY': apiKey || env.daftra.apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 15000,
      // الحفاظ على الأقواس المربعة كما يطلبها توثيق دفترة: order[updated]=desc و filter[product_code]=...
      paramsSerializer: (params) => {
        const parts: string[] = [];
        for (const [key, val] of Object.entries(params)) {
          if (val !== undefined && val !== null) {
            parts.push(`${key}=${encodeURIComponent(String(val))}`);
          }
        }
        return parts.join('&');
      },
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
        const errData = error.response.data;
        const detail = errData?.errors || errData?.validation_errors || errData?.error || '';
        const message = `${errData?.message || error.message} ${detail ? JSON.stringify(detail) : ''}`.trim();

        logger.error(`[DaftraClient] Request failed (${status}):`, message, JSON.stringify(errData));

        if (status === 401 || status === 403) {
          throw new UnauthorizedError('فشل الاتصال بدفترة: مفتاح الـ API غير صالح أو انتهت صلاحيته');
        }
        if (status === 404) {
          throw new NotFoundError('البيان المطلوب غير موجود في نظام دفترة');
        }
        throw new AppError(`خطأ في استجابة دفترة: ${message}`, status);
      }


      logger.error('[DaftraClient] Network or timeout error:', error.message);
      throw new AppError(`تعذر الاتصال بخادم دفترة: ${error.message}`, 503);
    }
  }

  /**
   * Get single product details by Daftra product ID
   */
  public async getProduct(productId: number): Promise<any> {
    return this.request({
      method: 'GET',
      url: `/products/${productId}.json`,
    });
  }

  /**
   * Get list of products from Daftra
   */
  public async getProducts(page: number = 1, limit: number = 50, orderBy: string = 'updated'): Promise<any> {
    return this.request({
      method: 'GET',
      url: `/products.json`,
      params: { page, limit, [`order[${orderBy}]`]: 'desc' },
    });
  }

  /**
   * Get list of storehouses from Daftra
   */
  public async getStorehouses(): Promise<any> {
    return this.request({
      method: 'GET',
      url: `/storehouses.json`,
    });
  }

  /**
   * Search product in Daftra by SKU (product_code)
   * الخطوة الثانية: البحث أونلاين في دفترة بكود الصنف
   */
  public async searchProductBySku(sku: string): Promise<any> {
    try {
      const res: any = await this.request({
        method: 'GET',
        url: `/products.json`,
        params: { 'filter[product_code]': sku, limit: 1 },
      });
      if (res?.data && Array.isArray(res.data) && res.data.length > 0) {
        return res.data[0].Product || res.data[0];
      }
      return null;
    } catch (err) {
      logger.warn(`[DaftraClient] Could not find product by SKU "${sku}" in Daftra:`, (err as any)?.message);
      return null;
    }
  }

  /**
   * Search product in Daftra by Barcode
   * الخطوة الثالثة: البحث أونلاين في دفترة برقم الباركود
   */
  public async searchProductByBarcode(barcode: string): Promise<any> {
    try {
      const res: any = await this.request({
        method: 'GET',
        url: `/products.json`,
        params: { 'filter[barcode]': barcode, limit: 1 },
      });
      if (res?.data && Array.isArray(res.data) && res.data.length > 0) {
        return res.data[0].Product || res.data[0];
      }
      return null;
    } catch (err) {
      logger.warn(`[DaftraClient] Could not find product by Barcode "${barcode}" in Daftra:`, (err as any)?.message);
      return null;
    }
  }

  /**
   * Search draft invoice in Daftra by store order ID / notes
   * لمنع تكرار مسودات الفواتير عند انقطاع الاتصال (Idempotency on Retry)
   */
  public async searchInvoiceByOrderRef(storeOrderId: string): Promise<any> {
    try {
      const res: any = await this.request({
        method: 'GET',
        url: `/invoices.json`,
        params: { 'filter[notes]': storeOrderId, limit: 50 },
      });
      if (res?.data && Array.isArray(res.data)) {
        for (const item of res.data) {
          const inv = item.Invoice || item;
          if (inv && inv.notes && typeof inv.notes === 'string' && inv.notes.includes(storeOrderId)) {
            return inv;
          }
        }
      }
      return null;
    } catch (err) {
      logger.warn(`[DaftraClient] Could not check existing invoice for order "${storeOrderId}":`, (err as any)?.message);
      return null;
    }
  }


  /**
   * Create a draft invoice in Daftra (إنشاء مسودة فاتورة في دفترة)
   * is_draft: 1 = Pure Draft: لا خصم مخزون، لا قيود، لا ZATCA حتى الاعتماد
   */
  public async createInvoice(payload: any): Promise<any> {
    return this.request({
      method: 'POST',
      url: `/invoices.json`,
      data: payload,
    });
  }

  /**
   * Get list of clients from Daftra
   */
  public async getClients(page: number = 1, limit: number = 50): Promise<any> {
    return this.request({
      method: 'GET',
      url: `/clients.json`,
      params: { page, limit },
    });
  }

  /**
   * Search client in Daftra by phone
   */
  public async searchClientByPhone(phone: string): Promise<any> {
    try {
      const cleanPhone = phone.replace(/[\s\-\+]/g, '');
      const res: any = await this.client.get('https://rahmamedical.daftra.com/v2/api/entity/client/list', {
        params: { 'filter[phone1]': cleanPhone },
      });
      const list = res?.data?.data || res?.data;
      if (Array.isArray(list) && list.length > 0) {
        return list[0];
      }
      return null;
    } catch (err: any) {
      logger.warn(`[DaftraClient] Could not search client by phone "${phone}":`, err.message);
      return null;
    }
  }

  /**
   * Search client in Daftra by email
   */
  public async searchClientByEmail(email: string): Promise<any> {
    try {
      const res: any = await this.client.get('https://rahmamedical.daftra.com/v2/api/entity/client/list', {
        params: { 'filter[email]': email },
      });
      const list = res?.data?.data || res?.data;
      if (Array.isArray(list) && list.length > 0) {
        return list[0];
      }
      return null;
    } catch (err: any) {
      logger.warn(`[DaftraClient] Could not search client by email "${email}":`, err.message);
      return null;
    }
  }

  /**
   * Create client in Daftra
   */
  public async createClient(clientData: {
    business_name: string;
    first_name?: string;
    last_name?: string;
    email?: string;
    phone1?: string;
    address1?: string;
  }): Promise<any> {
    return this.request({
      method: 'POST',
      url: `/clients.json`,
      data: { Client: clientData },
    });
  }

  /**
   * Get list of treasuries from Daftra
   */
  public async getTreasuries(): Promise<any> {
    return this.request({
      method: 'GET',
      url: `/treasuries.json`,
    });
  }
}

export const daftraClient = new DaftraClient();
