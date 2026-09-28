import { Router } from 'express';
import { OrderController } from '../controllers/OrderController';
import { authMiddleware } from '../../../shared/middlewares/authMiddleware';
import { auditAction, requirePermission } from '../../../shared/middlewares';

const router = Router();

router.use(authMiddleware);
router.get('/', OrderController.getOrders);
router.get('/stats', OrderController.getOrderStats);
router.post('/:id/retry-cancellation', auditAction('ORDER_RETRY_CANCELLATION', { entityType: 'ORDER', entityIdParam: 'id' }), requirePermission('cancellations.retry'), OrderController.retryOrderCancellation);
router.post('/:id/retry', auditAction('ORDER_RETRY', { entityType: 'ORDER', entityIdParam: 'id' }), requirePermission('orders.retry'), OrderController.retryOrder);
router.post('/simulate', auditAction('ORDER_SIMULATE', { entityType: 'ORDER' }), requirePermission('orders.simulate'), OrderController.simulateOrder);

export default router;
