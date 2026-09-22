import { Router } from 'express';
import { OrderController } from '../controllers/OrderController';
import { authMiddleware } from '../../../shared/middlewares/authMiddleware';

const router = Router();

// Protected Routes (تتطلب تسجيل الدخول)
router.get('/', authMiddleware, OrderController.getOrders);
router.get('/stats', authMiddleware, OrderController.getOrderStats);
router.post('/:id/retry-cancellation', authMiddleware, OrderController.retryOrderCancellation);
router.post('/:id/retry', authMiddleware, OrderController.retryOrder);
router.post('/simulate', authMiddleware, OrderController.simulateOrder);

export default router;
