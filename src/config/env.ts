import dotenv from 'dotenv';
dotenv.config();

const nodeEnv = process.env.NODE_ENV || 'development';
const enableTrendyol = process.env.ENABLE_TRENDYOL === 'true';

const requiredInProduction = [
  'JWT_SECRET',
  'DB_PASSWORD',
  'DAFTRA_API_KEY',
  'ZID_API_TOKEN',
  'ZID_STORE_ID',
];

if (enableTrendyol) {
  requiredInProduction.push('TRENDYOL_API_KEY', 'TRENDYOL_API_SECRET');
}

if (nodeEnv === 'production') {
  const missing = requiredInProduction.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required production environment variables: ${missing.join(', ')}`);
  }
  const unsafeKeys = ['JWT_SECRET', 'DAFTRA_API_KEY', 'ZID_API_TOKEN'];
  if (enableTrendyol) {
    unsafeKeys.push('TRENDYOL_API_SECRET');
  }
  const unsafe = unsafeKeys.filter((key) => /^(test_|your_|development-only|replace_with)/i.test(process.env[key] || ''));
  if (unsafe.length > 0) {
    throw new Error(`Unsafe placeholder production environment variables: ${unsafe.join(', ')}`);
  }
}

export const env = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv,
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',

  // Database
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    name: process.env.DB_NAME || 'daftra_sync_hub',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
  },

  // JWT
  jwt: {
    secret: process.env.JWT_SECRET || 'development-only-jwt-secret-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  // Daftra ERP API & Accounting Configuration
  daftra: {
    baseUrl: process.env.DAFTRA_API_BASE_URL || 'https://rahmamedical.daftra.com/api2',
    apiKey: process.env.DAFTRA_API_KEY || 'test_daftra_key',

    // Operational IDs
    defaultClientId: parseInt(process.env.DAFTRA_DEFAULT_CLIENT_ID || '3', 10), // عميل عام
    zidGuestClientId: parseInt(process.env.DAFTRA_ZID_CLIENT_ID || '3964', 10), // حساب عملاء زد b2c (ID: 3964, Code: 12044946)
    consolidateZidClients: process.env.CONSOLIDATE_ZID_CLIENTS === 'true', // افتراضياً معطل — الفواتير تصدر باسم العميل الحقيقي
    storehouseId: parseInt(process.env.DAFTRA_ONLINE_STOREHOUSE_ID || '3', 10), // مستودع المتجر الالكتروني

    // GL Accounts
    zidRevenueAccountId: parseInt(process.env.DAFTRA_ZID_REVENUE_ACCOUNT_ID || '4689', 10), // كود 413 مبيعات متجر زد
    generalRevenueAccountId: parseInt(process.env.DAFTRA_GENERAL_REVENUE_ACCOUNT_ID || '28', 10), // كود 411 المبيعات
    trendyolRevenueAccountId: parseInt(process.env.DAFTRA_TRENDYOL_REVENUE_ACCOUNT_ID || '4690', 10), // كود 414 مبيعات متجر ترينديول
    shippingRevenueAccountId: parseInt(process.env.DAFTRA_SHIPPING_REVENUE_ACCOUNT_ID || '4691', 10), // كود 415 إيرادات الشحن والتوصيل
    discountAccountId: parseInt(process.env.DAFTRA_DISCOUNT_ACCOUNT_ID || '365', 10), // كود 513 خصم مسموح به

    // Treasuries / Settlement Accounts
    tabbyTreasuryId: parseInt(process.env.DAFTRA_TABBY_TREASURY_ID || '19', 10), // tabby
    tamaraTreasuryId: parseInt(process.env.DAFTRA_TAMARA_TREASURY_ID || '21', 10), // tamara
    zidpayTreasuryId: parseInt(process.env.DAFTRA_ZIDPAY_TREASURY_ID || '18', 10), // zidpay
    codTreasuryId: parseInt(process.env.DAFTRA_COD_TREASURY_ID || '35', 10), // تسوية الدفع عند الاستلام (120130)
    trendyolTreasuryId: parseInt(process.env.DAFTRA_TRENDYOL_TREASURY_ID || '25', 10), // prepaid_trendyol

    // Taxes
    vat15TaxId: parseInt(process.env.DAFTRA_VAT_15_TAX_ID || '4', 10), // القيمة المضافة 15% (غير شاملة)
    vat15InclusiveTaxId: parseInt(process.env.DAFTRA_VAT_15_INCLUSIVE_TAX_ID || '7', 10), // شامل القيمة المضافة 15%
    vatZeroTaxId: parseInt(process.env.DAFTRA_VAT_ZERO_TAX_ID || '5', 10), // صفرية 0%
    vatExemptTaxId: parseInt(process.env.DAFTRA_VAT_EXEMPT_TAX_ID || '6', 10), // معافاة 0%
  },

  // Zid Store API
  zid: {
    baseUrl: process.env.ZID_API_BASE_URL || 'https://api.zid.sa/v1',
    token: process.env.ZID_API_TOKEN || 'test_zid_token',
    managerToken: process.env.ZID_MANAGER_TOKEN || process.env.ZID_API_TOKEN || '',
    storeId: process.env.ZID_STORE_ID || 'test_store_id',
  },

  webhooks: {
    zidSecret: process.env.ZID_WEBHOOK_SECRET || '',
    trendyolSecret: process.env.TRENDYOL_WEBHOOK_SECRET || '',
    daftraSecret: process.env.DAFTRA_WEBHOOK_SECRET || '',
  },

  // Trendyol Marketplace API
  trendyol: {
    baseUrl: process.env.TRENDYOL_API_BASE_URL || 'https://api.trendyol.com/sapigw',
    supplierId: process.env.TRENDYOL_SUPPLIER_ID || 'test_supplier_id',
    apiKey: process.env.TRENDYOL_API_KEY || 'test_trendyol_key',
    apiSecret: process.env.TRENDYOL_API_SECRET || 'test_trendyol_secret',
  },

  // Feature Flag: Enable/Disable Trendyol integration without code deletion
  enableTrendyol: process.env.ENABLE_TRENDYOL === 'true' || process.env.NODE_ENV === 'test',
};
