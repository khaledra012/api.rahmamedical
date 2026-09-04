import { Router } from 'express';
import { webhookController } from '../controllers/WebhookController';
import { asyncHandler, validateWebhookPayload, verifyWebhookSignature, webhookRateLimit } from '../../../shared/middlewares';

const router = Router();

// Public Webhook endpoints for Daftra
router.post('/product-created', webhookRateLimit, verifyWebhookSignature('daftra'), validateWebhookPayload, asyncHandler(webhookController.handleProductCreated));
router.post('/product-updated', webhookRateLimit, verifyWebhookSignature('daftra'), validateWebhookPayload, asyncHandler(webhookController.handleProductUpdated));

export const webhookRoutes = router;
