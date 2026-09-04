import { NextFunction, Request, Response } from 'express';
import crypto from 'crypto';
import { env } from '../../config/env';
import { ForbiddenError, ValidationError } from '../errors';
import { getClientIp } from './rateLimiter';

type WebhookProvider = 'zid' | 'trendyol' | 'daftra';

const requestCounts = new Map<string, { count: number; resetAt: number }>();

export const webhookRateLimit = (req: Request, res: Response, next: NextFunction): void => {
  const now = Date.now();
  const key = getClientIp(req);
  const entry = requestCounts.get(key);
  const state = !entry || entry.resetAt <= now ? { count: 0, resetAt: now + 60_000 } : entry;
  state.count += 1;
  requestCounts.set(key, state);
  if (state.count > 120) {
    res.status(429).json({ success: false, message: 'Too many webhook requests' });
    return;
  }
  next();
};

const secretFor = (provider: WebhookProvider): string => ({
  zid: env.webhooks.zidSecret,
  trendyol: env.webhooks.trendyolSecret,
  daftra: env.webhooks.daftraSecret,
}[provider]);

export const verifyWebhookSignature = (provider: WebhookProvider) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const secret = secretFor(provider);
    if (!secret) {
      if (env.nodeEnv === 'production') {
        next(new ForbiddenError('Webhook secret is not configured'));
        return;
      }
      return next();
    }

    const signature =
      req.header('x-zid-webhook-signature') ||
      req.header('x-webhook-signature') ||
      req.header('x-signature') ||
      '';

    if (!signature) {
      if (env.nodeEnv === 'production') {
        next(new ForbiddenError('Missing webhook signature header'));
        return;
      }
      return next();
    }

    const received = signature.replace(/^sha256=/i, '');
    const rawBody = (req as any).rawBody || Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}));
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    const valid =
      received.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));

    if (!valid) {
      next(new ForbiddenError('Invalid webhook signature'));
      return;
    }
    next();
  };

export const validateWebhookPayload = (req: Request, _res: Response, next: NextFunction): void => {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    next(new ValidationError('Invalid webhook payload'));
    return;
  }
  next();
};
