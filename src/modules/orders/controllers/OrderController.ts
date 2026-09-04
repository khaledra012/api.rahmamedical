import { Request, Response } from 'express';
import { orderService } from '../services/OrderService';
import { asyncHandler } from '../../../shared/middlewares/asyncHandler';
import { sendSuccess, sendCreated } from '../../../shared/helpers/responseFormatter';
import { OrderFilterParams } from '../dtos/order.dtos';

export class OrderController {
  /**
   * GET /api/orders - جلب قائمة الطلبات مع الفلترة
   */
  static getOrders = asyncHandler(async (req: Request, res: Response) => {
    const filters: OrderFilterParams = {
      status: req.query.status as any,
      storeType: req.query.storeType as any,
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
    };

    const result = await orderService.getOrders(filters);
    sendSuccess(res, result);
  });

  /**
   * GET /api/orders/stats - إحصائيات لوحة المؤشرات
   */
  static getOrderStats = asyncHandler(async (req: Request, res: Response) => {
    const stats = await orderService.getOrderStats();
    sendSuccess(res, stats);
  });

  /**
   * POST /api/orders/:id/retry - إعادة محاولة فوترة طلب متعثر
   */
  static retryOrder = asyncHandler(async (req: Request, res: Response) => {
    const orderId = parseInt(req.params.id as string, 10);
    const order = await orderService.retryOrder(orderId);
    sendSuccess(res, order);
  });

  /**
   * POST /api/orders/simulate - محاكاة طلب تجريبي للاختبار
   */
  static simulateOrder = asyncHandler(async (req: Request, res: Response) => {
    const { mockZidOrderWebhook } = await import('../../../shared/integrations/__mocks__/orderFixtures');
    const { Product } = await import('../../products/models/Product');

    const existingProduct = await Product.findOne();

    const items = existingProduct
      ? [
          {
            sku: existingProduct.sku,
            barcode: existingProduct.barcode || undefined,
            productName: existingProduct.nameAr || 'منتج طبي',
            quantity: 1,
            unitPrice: existingProduct.price || 50,
            discount: 0,
            taxPercentage: 15,
            lineTotal: existingProduct.price || 50,
            daftraProductId: existingProduct.daftraProductId,
          },
        ]
      : mockZidOrderWebhook.items;

    const totalAmount = existingProduct ? (existingProduct.price || 50) + 25 : mockZidOrderWebhook.totalAmount;

    const order = await orderService.handleIncomingOrder({
      ...mockZidOrderWebhook,
      storeOrderId: `SIM-${Date.now()}`,
      orderDate: new Date().toISOString(),
      items,
      totalAmount,
    });
    sendCreated(res, order);
  });
}
