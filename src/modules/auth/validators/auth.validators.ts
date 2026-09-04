import { body } from 'express-validator';

export const loginValidationRules = [
  body('email')
    .notEmpty()
    .withMessage('البريد الإلكتروني مطلوب')
    .isEmail()
    .withMessage('يرجى إدخال بريد إلكتروني صالح')
    .normalizeEmail(),
  body('password')
    .notEmpty()
    .withMessage('كلمة المرور مطلوبة')
    .isLength({ min: 6 })
    .withMessage('يجب ألا تقل كلمة المرور عن 6 أحرف'),
];
