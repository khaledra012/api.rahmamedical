import { Router } from 'express';
import { OrderWebhookController } from '../controllers/OrderWebhookController';
import { validateWebhookPayload, webhookRateLimit } from '../../../shared/middlewares';

const router = Router();

// Public Routes (Webhooks — لا تتطلب مصادقة لاستقبال أحداث المتاجر)
router.post('/zid/order-created', webhookRateLimit, validateWebhookPayload, OrderWebhookController.handleZidOrderCreated);
router.post('/trendyol/order-created', webhookRateLimit, validateWebhookPayload, OrderWebhookController.handleTrendyolOrderCreated);

export default router;
