import { body, param } from 'express-validator';

export const userIdValidation = [param('id').isInt({ min: 1 }).withMessage('معرّف المستخدم غير صالح')];

export const createUserValidation = [
  body('name').trim().isLength({ min: 2, max: 100 }).withMessage('اسم المستخدم مطلوب'),
  body('username')
    .trim()
    .isLength({ min: 3, max: 80 })
    .withMessage('اسم الدخول يجب أن يكون من 3 إلى 80 حرفاً')
    .matches(/^[a-zA-Z0-9._-]+$/)
    .withMessage('اسم الدخول يقبل الحروف الإنجليزية والأرقام والنقطة والشرطة فقط'),
  body('email').isEmail().withMessage('البريد الإلكتروني غير صالح').normalizeEmail(),
  body('password').isLength({ min: 6, max: 100 }).withMessage('كلمة المرور يجب ألا تقل عن 6 خانات'),
  body('role').isIn(['operator', 'viewer']).withMessage('الدور يجب أن يكون موظف تشغيل أو مشاهدة فقط'),
];

export const updateUserValidation = [
  ...userIdValidation,
  body('name').optional().trim().isLength({ min: 2, max: 100 }).withMessage('الاسم غير صالح'),
  body('username')
    .optional()
    .trim()
    .isLength({ min: 3, max: 80 })
    .matches(/^[a-zA-Z0-9._-]+$/)
    .withMessage('اسم الدخول غير صالح'),
  body('email').optional().isEmail().withMessage('البريد الإلكتروني غير صالح').normalizeEmail(),
  body('role').optional().isIn(['operator', 'viewer']).withMessage('الدور غير صالح'),
  body('isActive').optional().isBoolean().withMessage('حالة المستخدم غير صالحة'),
];

export const resetPasswordValidation = [
  ...userIdValidation,
  body('password').isLength({ min: 6, max: 100 }).withMessage('كلمة المرور يجب ألا تقل عن 6 خانات'),
];
