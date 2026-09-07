import { Router } from 'express';
import { LogController } from '../controllers/LogController';
import { asyncHandler } from '../../../shared/middlewares/asyncHandler';
import { authMiddleware } from '../../../shared/middlewares/authMiddleware';

const router = Router();

// All log routes are protected by authMiddleware
router.use(authMiddleware);

router.get('/', asyncHandler(LogController.getLogs));
router.get('/stats', asyncHandler(LogController.getStats));
router.get('/:id', asyncHandler(LogController.getLogById));
router.post('/:id/retry', asyncHandler(LogController.retryLog));

export default router;
