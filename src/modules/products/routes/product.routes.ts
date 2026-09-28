import { Router } from 'express';
import { productController } from '../controllers/ProductController';
import {
  enrichProductValidationRules,
  productIdParamValidation,
  productListQueryValidation,
} from '../validators/product.validators';
import { validateRequest, asyncHandler, auditAction, requirePermission } from '../../../shared/middlewares';

const router = Router();

// Dashboard stats route
router.get('/stats', asyncHandler(productController.getStats));

// Store categories & brands
router.get('/zid-categories', asyncHandler(productController.getZidCategories));
router.get('/trendyol-brands', asyncHandler(productController.getTrendyolBrands));

// Products list with filters
router.get('/', productListQueryValidation, validateRequest, asyncHandler(productController.getProducts));

// Sync products on-demand from Daftra
router.post('/sync-daftra', auditAction('PRODUCT_SYNC', { entityType: 'PRODUCT' }), requirePermission('products.manage'), asyncHandler(productController.syncFromDaftra));

// Smart auto-link pending products with Zid by SKU
router.post('/auto-link', auditAction('PRODUCT_AUTO_LINK', { entityType: 'PRODUCT' }), requirePermission('products.manage'), asyncHandler(productController.autoLinkPending));

// Single product details
router.get('/:id', productIdParamValidation, validateRequest, asyncHandler(productController.getProductById));

// Enrich product marketing data
router.patch('/:id/enrich', auditAction('PRODUCT_ENRICH', { entityType: 'PRODUCT', entityIdParam: 'id' }), requirePermission('products.manage'), enrichProductValidationRules, validateRequest, asyncHandler(productController.enrichProduct));

// Publish endpoints
router.post('/:id/publish', auditAction('PRODUCT_PUBLISH_ZID', { entityType: 'PRODUCT', entityIdParam: 'id' }), requirePermission('products.manage'), productIdParamValidation, validateRequest, asyncHandler(productController.publishToZid));
router.post('/:id/publish-trendyol', auditAction('PRODUCT_PUBLISH_TRENDYOL', { entityType: 'PRODUCT', entityIdParam: 'id' }), requirePermission('products.manage'), productIdParamValidation, validateRequest, asyncHandler(productController.publishToTrendyol));
router.post('/:id/publish-all', auditAction('PRODUCT_PUBLISH_ALL', { entityType: 'PRODUCT', entityIdParam: 'id' }), requirePermission('products.manage'), productIdParamValidation, validateRequest, asyncHandler(productController.publishToAll));

// Retry publishing
router.post('/:id/retry', auditAction('PRODUCT_RETRY', { entityType: 'PRODUCT', entityIdParam: 'id' }), requirePermission('products.manage'), productIdParamValidation, validateRequest, asyncHandler(productController.retryPublish));

// Toggle pause/active
router.patch('/:id/pause', auditAction('PRODUCT_TOGGLE_PAUSE', { entityType: 'PRODUCT', entityIdParam: 'id' }), requirePermission('products.manage'), productIdParamValidation, validateRequest, asyncHandler(productController.togglePause));

export const productRoutes = router;
