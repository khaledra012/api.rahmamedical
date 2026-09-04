export type PublishStatus = 'PENDING_REVIEW' | 'PUBLISHING' | 'PUBLISHED' | 'FAILED' | 'PAUSED';

export interface DaftraWebhookProductPayload {
  id: number;
  name: string;
  product_code?: string;
  barcode?: string;
  unit_price?: number | string;
  cost?: number | string;
  discount_price?: number | string;
  stock_balance?: number | string;
  storehouse_id?: number | string;
  description?: string;
  weight?: number | string;
  is_taxable?: boolean | number;
  tax_percentage?: number | string;
  category_name?: string;
  [key: string]: any;
}

export interface ProductEnrichDto {
  name_en?: string;
  description_ar?: string;
  description_en?: string;
  zid_category_ids?: number[];
  trendyol_category_id?: number;
  trendyol_brand_id?: number;
  images?: string[];
  seo_keywords?: string;
}

export interface ProductFilters {
  status?: PublishStatus | 'ALL';
  store?: 'ALL' | 'ZID' | 'TRENDYOL';
  search?: string;
  page?: number;
  limit?: number;
}
