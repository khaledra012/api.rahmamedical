import { Router } from 'express';
import { UserController } from '../controllers/UserController';
import { authMiddleware, asyncHandler, auditAction, requirePermission, validateRequest } from '../../../shared/middlewares';
import { createUserValidation, resetPasswordValidation, updateUserValidation } from '../validators/user.validators';

const router = Router();
router.use(authMiddleware);
router.use(requirePermission('users.manage'));

router.get('/', asyncHandler(UserController.list));
router.post('/', auditAction('USER_CREATE', { entityType: 'USER' }), createUserValidation, validateRequest, asyncHandler(UserController.create));
router.patch('/:id', auditAction('USER_UPDATE', { entityType: 'USER', entityIdParam: 'id' }), updateUserValidation, validateRequest, asyncHandler(UserController.update));
router.post('/:id/reset-password', auditAction('USER_RESET_PASSWORD', { entityType: 'USER', entityIdParam: 'id' }), resetPasswordValidation, validateRequest, asyncHandler(UserController.resetPassword));

export default router;
