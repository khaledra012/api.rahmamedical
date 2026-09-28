import { Router } from 'express';
import { authController } from '../controllers/AuthController';
import { loginValidationRules } from '../validators/auth.validators';
import { validateRequest, authMiddleware, asyncHandler, authRateLimiter } from '../../../shared/middlewares';
import { auditAction } from '../../../shared/middlewares/auditMiddleware';

const router = Router();

// Public route: Login (محمي بـ Rate Limiter لمنع هجمات التخمين Brute-Force)
router.post('/login', authRateLimiter, loginValidationRules, validateRequest, asyncHandler(authController.login));

// Protected route: Current user profile
router.get('/me', authMiddleware, asyncHandler(authController.getMe));

// Protected route: Change password
router.post(
  '/change-password',
  authMiddleware,
  auditAction('AUTH_CHANGE_PASSWORD', { entityType: 'USER', useCurrentUserId: true }),
  asyncHandler(authController.changePassword)
);
router.post(
  '/logout',
  authMiddleware,
  auditAction('AUTH_LOGOUT', { entityType: 'USER', useCurrentUserId: true }),
  asyncHandler(authController.logout)
);

export const authRoutes = router;
