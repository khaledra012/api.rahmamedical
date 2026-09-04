import { Request, Response } from 'express';
import { productService } from '../services/ProductService';
import { sendSuccess } from '../../../shared/helpers/responseFormatter';
import { logger } from '../../../shared/helpers/logger';

export class WebhookController {
  /**
   * POST /api/webhooks/daftra/product-created
   */
  public handleProductCreated = async (req: Request, res: Response): Promise<Response> => {
    logger.info('[Webhook] Received Daftra product.created event');

    // Extract product object (Daftra often nests in body.Product or body directly)
    const payload = req.body?.Product || req.body?.data || req.body;
    const product = await productService.handleIncomingWebhook(payload);

    return sendSuccess(
      res,
      { productId: product.id, daftraProductId: product.daftraProductId, status: product.publishStatus },
      'تم استقبال وحفظ منتج دفترة بنجاح',
      200
    );
  };

  /**
   * POST /api/webhooks/daftra/product-updated
   */
  public handleProductUpdated = async (req: Request, res: Response): Promise<Response> => {
    logger.info('[Webhook] Received Daftra product.updated event');

    const payload = req.body?.Product || req.body?.data || req.body;
    const product = await productService.handleIncomingWebhook(payload);

    return sendSuccess(
      res,
      { productId: product.id, daftraProductId: product.daftraProductId, status: product.publishStatus },
      'تم تحديث بيانات المنتج بنجاح',
      200
    );
  };
}

export const webhookController = new WebhookController();
