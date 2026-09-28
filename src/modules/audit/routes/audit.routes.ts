import { Router } from 'express';
import { AuditController } from '../controllers/AuditController';
import { authMiddleware, asyncHandler } from '../../../shared/middlewares';

const router = Router();
router.use(authMiddleware);
router.get('/', asyncHandler(AuditController.getLogs));

export default router;
