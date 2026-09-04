import { Request, Response, NextFunction } from 'express';

export interface RateLimiterOptions {
  windowMs: number;
  max: number;
  message: string;
}

/**
 * استخراج عنوان الـ IP الحقيقي للعميل مع دعم البروكسي (Nginx / Cloudflare / Load Balancers)
 */
export const getClientIp = (req: Request): string => {
  // 1. فحص هيدر Cloudflare (CF-Connecting-IP)
  const cfIp = req.headers['cf-connecting-ip'];
  if (typeof cfIp === 'string' && cfIp.trim()) {
    return cfIp.trim();
  }

  // 2. فحص هيدر البروكسي المعتمد X-Forwarded-For (أول IP في السلسلة هو العميل الأصلي)
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    const firstIp = forwarded.split(',')[0].trim();
    if (firstIp) return firstIp.replace(/^::ffff:/, '');
  } else if (Array.isArray(forwarded) && forwarded.length > 0) {
    const firstIp = forwarded[0].trim();
    if (firstIp) return firstIp.replace(/^::ffff:/, '');
  }

  // 3. فحص هيدر X-Real-IP (المرسل غالباً من Nginx)
  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp.trim()) {
    return realIp.trim().replace(/^::ffff:/, '');
  }

  // 4. استخدام req.ip المحسوب من Express بعد تفعيل trust proxy
  if (req.ip) {
    return req.ip.replace(/^::ffff:/, '');
  }

  // 5. استخدام عنوان المقبس المباشر كخيار أخير
  return (req.socket.remoteAddress || 'unknown').replace(/^::ffff:/, '');
};

/**
 * دالة مصنع لإنشاء محدد معدل الطلبات (Rate Limiter) في الذاكرة
 * مع ميزة التنظيف الدوري التلقائي لمنع تراكم الذاكرة (Memory Leaks)
 */
export const createRateLimiter = (options: RateLimiterOptions) => {
  const counts = new Map<string, { count: number; resetAt: number }>();

  // تنظيف السجلات المنتهية بشكل دوري
  if (process.env.NODE_ENV !== 'test') {
    const timer = setInterval(() => {
      const now = Date.now();
      for (const [key, val] of counts.entries()) {
        if (val.resetAt <= now) {
          counts.delete(key);
        }
      }
    }, options.windowMs * 2);
    if (timer.unref) timer.unref();
  }

  return (req: Request, res: Response, next: NextFunction): void => {
    // في بيئة الاختبارات، لا نعيق عمل Jest
    if (process.env.NODE_ENV === 'test') {
      return next();
    }

    const now = Date.now();
    const key = getClientIp(req);
    const entry = counts.get(key);
    const state = !entry || entry.resetAt <= now ? { count: 0, resetAt: now + options.windowMs } : entry;

    state.count += 1;
    counts.set(key, state);

    res.setHeader('X-RateLimit-Limit', options.max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, options.max - state.count));
    res.setHeader('X-RateLimit-Reset', Math.ceil(state.resetAt / 1000));

    if (state.count > options.max) {
      res.status(429).json({
        success: false,
        message: options.message,
      });
      return;
    }

    next();
  };
};

/**
 * 1. حماية صفحة تسجيل الدخول من هجمات التخمين (Brute-Force Protection)
 * الحد الأقصى: 10 محاولات في الدقيقة لكل عنوان IP
 */
export const authRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // دقيقة واحدة
  max: 10,
  message: 'تم تجاوز الحد الأقصى لمحاولات تسجيل الدخول. يرجى الانتظار دقيقة والمحاولة مجدداً.',
});

/**
 * 2. حماية الـ API العام من الاستنزاف وهجمات الحرمان من الخدمة (General API Protection)
 * الحد الأقصى: 200 طلب في الدقيقة لكل عنوان IP
 */
export const apiRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // دقيقة واحدة
  max: 200,
  message: 'تم تجاوز معدل الطلبات المسموح به للـ API. يرجى التمهل والمحاولة لاحقاً.',
});
