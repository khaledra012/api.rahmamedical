import { Router } from 'express';
import { productController } from '../controllers/ProductController';
import {
  enrichProductValidationRules,
  productIdParamValidation,
  productListQueryValidation,
} from '../validators/product.validators';
import { validateRequest, asyncHandler } from '../../../shared/middlewares';

const router = Router();

// Dashboard stats route
router.get('/stats', asyncHandler(productController.getStats));

// Store categories & brands
router.get('/zid-categories', asyncHandler(productController.getZidCategories));
router.get('/trendyol-brands', asyncHandler(productController.getTrendyolBrands));

// Products list with filters
router.get('/', productListQueryValidation, validateRequest, asyncHandler(productController.getProducts));

// Single product details
router.get('/:id', productIdParamValidation, validateRequest, asyncHandler(productController.getProductById));

// Enrich product marketing data
router.patch('/:id/enrich', enrichProductValidationRules, validateRequest, asyncHandler(productController.enrichProduct));

// Publish endpoints
router.post('/:id/publish', productIdParamValidation, validateRequest, asyncHandler(productController.publishToZid));
router.post('/:id/publish-trendyol', productIdParamValidation, validateRequest, asyncHandler(productController.publishToTrendyol));
router.post('/:id/publish-all', productIdParamValidation, validateRequest, asyncHandler(productController.publishToAll));

// Retry publishing
router.post('/:id/retry', productIdParamValidation, validateRequest, asyncHandler(productController.retryPublish));

// Toggle pause/active
router.patch('/:id/pause', productIdParamValidation, validateRequest, asyncHandler(productController.togglePause));

export const productRoutes = router;
