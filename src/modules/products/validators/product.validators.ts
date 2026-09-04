import { body, param, query } from 'express-validator';

export const enrichProductValidationRules = [
  param('id').isInt().withMessage('معرف المنتج يجب أن يكون رقماً صحيحاً'),
  body('name_en').optional().isString().trim(),
  body('description_ar').optional().isString().trim(),
  body('description_en').optional().isString().trim(),
  body('zid_category_ids').optional().isArray().withMessage('أقسام زد يجب أن تكون مصفوفة معرفات'),
  body('images').optional().isArray().withMessage('الصور يجب أن تكون مصفوفة روابط'),
  body('seo_keywords').optional().isString().trim(),
];

export const productIdParamValidation = [
  param('id').isInt().withMessage('معرف المنتج يجب أن يكون رقماً صحيحاً'),
];

export const productListQueryValidation = [
  query('page').optional().isInt({ min: 1 }).withMessage('رقم الصفحة يجب أن يكون أكبر من 0'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('حد النتائج يجب أن يكون بين 1 و 100'),
  query('status')
    .optional()
    .isIn(['ALL', 'PENDING_REVIEW', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'PAUSED'])
    .withMessage('حالة الفلترة غير صالحة'),
  query('search').optional().isString().trim(),
];
