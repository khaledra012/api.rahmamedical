import { body } from 'express-validator';

export const loginValidationRules = [
  body('identifier')
    .custom((value, { req }) => {
      const identifier = String(value || req.body?.email || '').trim();
      if (identifier.length < 3 || identifier.length > 150) {
        throw new Error('البريد الإلكتروني أو اسم المستخدم مطلوب');
      }
      req.body.identifier = identifier;
      return true;
    }),
  body('password')
    .notEmpty()
    .withMessage('كلمة المرور مطلوبة')
    .isLength({ min: 6 })
    .withMessage('يجب ألا تقل كلمة المرور عن 6 أحرف'),
];
