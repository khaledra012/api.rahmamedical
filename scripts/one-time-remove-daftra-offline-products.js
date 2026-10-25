/*
 * One-time production cleanup.
 *
 * This script intentionally does not modify application code and has no
 * scheduler. It removes only local dashboard products whose current Daftra
 * payload explicitly says they are not available online. Products with a
 * missing availability field are kept (fail-safe).
 *
 * Run from backend/ with:
 *   node scripts/one-time-remove-daftra-offline-products.js
 */

const fs = require('node:fs');
const path = require('node:path');
const axios = require('axios');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const PAGE_SIZE = 100;
const MAX_PAGES = 1000;

function isExplicitlyOffline(product) {
  if (!product || typeof product !== 'object') return null;

  const raw =
    product.availabe_online ??
    product.available_online ??
    product.availableOnline;

  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw === 'boolean') return raw === false;
  if (typeof raw === 'number') return raw === 0;

  const normalized = String(raw).trim().toLowerCase();
  if (['0', 'false', 'no', 'off'].includes(normalized)) return true;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return false;
  return null;
}

function getDaftraListUrl() {
  const configured = process.env.DAFTRA_API_BASE_URL || '';
  const parsed = new URL(configured || 'https://rahmamedical.daftra.com/api2');
  return `${parsed.origin}/v2/api/entity/product/list`;
}

async function fetchAllDaftraProducts() {
  const productsById = new Map();
  const url = getDaftraListUrl();
  const headers = {
    apikey: process.env.DAFTRA_API_KEY,
    'API-KEY': process.env.DAFTRA_API_KEY,
    Accept: 'application/json',
  };

  let lastPage = null;
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const response = await axios.get(url, {
      headers,
      params: { page, per_page: PAGE_SIZE, 'order[modified]': 'desc' },
      timeout: 30000,
    });

    const body = response.data || {};
    const rows = Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : [];
    if (page === 1 && Number.isFinite(Number(body?.last_page))) {
      lastPage = Number(body.last_page);
    }
    for (const row of rows) {
      const product = row?.Product || row;
      if (product?.id !== undefined && product?.id !== null) {
        productsById.set(String(product.id), product);
      }
    }

    if (page === 1 || page % 10 === 0 || (lastPage && page === lastPage)) {
      console.log(`Daftra page ${page}${lastPage ? `/${lastPage}` : ''} read (${productsById.size} products)`);
    }

    if (lastPage ? page >= lastPage : rows.length < PAGE_SIZE) return productsById;
  }

  throw new Error(`Daftra pagination exceeded ${MAX_PAGES} pages; refusing to delete anything.`);
}

async function main() {
  if (!process.env.DB_HOST || !process.env.DB_NAME || !process.env.DB_USER || !process.env.DAFTRA_API_KEY) {
    throw new Error('Required production DB/Daftra environment variables are missing.');
  }
  if (/^(localhost|127\.0\.0\.1)$/i.test(String(process.env.DB_HOST).trim())) {
    throw new Error('Refusing to run against a local database. Set the Hostinger production DB_HOST explicitly.');
  }

  const daftraProducts = await fetchAllDaftraProducts();
  if (daftraProducts.size === 0) {
    throw new Error('Daftra returned zero products; refusing to delete anything.');
  }

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    charset: 'utf8mb4',
  });

  try {
    const [products] = await connection.query(
      'SELECT id, daftra_product_id, sku, name_ar, raw_daftra_data FROM products'
    );

    const candidates = products.filter((localProduct) => {
      const daftraProduct = daftraProducts.get(String(localProduct.daftra_product_id));
      // If the product is absent from a complete Daftra listing, or the flag is
      // missing/unknown, fail safe and keep it.
      return daftraProduct && isExplicitlyOffline(daftraProduct) === true;
    });

    console.log(`Daftra products read: ${daftraProducts.size}`);
    console.log(`Production dashboard products read: ${products.length}`);
    console.log(`Products explicitly offline and eligible for removal: ${candidates.length}`);

    if (candidates.length === 0) {
      console.log('Nothing to remove. No production data was changed.');
      return;
    }

    const ids = candidates.map((row) => row.id);
    const placeholders = ids.map(() => '?').join(',');
    const [mappings] = await connection.query(
      `SELECT * FROM product_mappings WHERE product_id IN (${placeholders})`,
      ids
    );

    const backupDir = path.resolve(__dirname, '../../one-time-cleanup-backups');
    fs.mkdirSync(backupDir, { recursive: true });
    const backupPath = path.join(
      backupDir,
      `offline-products-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    );
    fs.writeFileSync(
      backupPath,
      JSON.stringify({ createdAt: new Date().toISOString(), products: candidates, productMappings: mappings }, null, 2),
      'utf8'
    );
    console.log(`Backup written: ${backupPath}`);

    await connection.beginTransaction();
    try {
      await connection.query(
        `DELETE FROM product_mappings WHERE product_id IN (${placeholders})`,
        ids
      );
      await connection.query(
        `DELETE FROM products WHERE id IN (${placeholders})`,
        ids
      );
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    }

    const [remaining] = await connection.query(
      `SELECT COUNT(*) AS count FROM products WHERE id IN (${placeholders})`,
      ids
    );
    if (Number(remaining[0]?.count || 0) !== 0) {
      throw new Error('Verification failed: some targeted products still exist.');
    }

    console.log(`Removed ${candidates.length} offline products from the production dashboard.`);
    console.log('Orders and order_items were not modified. Daftra/Zid/Trendyol were not modified.');
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(`Cleanup failed: ${error.message}`);
  process.exitCode = 1;
});
