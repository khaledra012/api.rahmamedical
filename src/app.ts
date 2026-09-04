import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env';
import { errorHandler } from './shared/middlewares/errorHandler';
import { authMiddleware } from './shared/middlewares/authMiddleware';
import { sendSuccess } from './shared/helpers/responseFormatter';
import { NotFoundError } from './shared/errors';
import { authRoutes } from './modules/auth/routes/auth.routes';
import { productRoutes } from './modules/products/routes/product.routes';
import orderRoutes from './modules/orders/routes/order.routes';
import orderWebhookRoutes from './modules/orders/routes/order-webhook.routes';
import logRoutes from './modules/logs/routes/log.routes';
import { apiRateLimiter } from './shared/middlewares/rateLimiter';

export const createApp = (): Application => {
  const app: Application = express();

  // تفعيل الثقة في البروكسي (Nginx / Cloudflare) لقراءة الـ IP الحقيقي للعملاء عبر X-Forwarded-For
  app.set('trust proxy', 1);

  // Security HTTP headers
  app.use(helmet());

  // CORS configuration
  app.use(
    cors({
      origin: [env.clientUrl, 'http://localhost:5173', 'http://localhost:3000'],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  );

  // Body parser
  app.use(express.json({ limit: '1mb', verify: (req, _res, buffer) => { (req as Request).rawBody = buffer; } }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Root Health Check Route
  app.get('/', (req: Request, res: Response) => {
    return sendSuccess(
      res,
      {
        name: 'Rahma Medical Supplies Sync Hub API',
        version: '1.0.0',
        status: 'healthy',
        timestamp: new Date().toISOString(),
      },
      'Rahma Sync Hub API is running'
    );
  });

  // API Status Route
  app.get('/api/health', (req: Request, res: Response) => {
    return sendSuccess(
      res,
      {
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        environment: env.nodeEnv,
      },
      'System health status'
    );
  });

  // General API Rate Limiting (200 requests/minute per IP)
  app.use('/api', apiRateLimiter);

  // Public Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/webhooks', orderWebhookRoutes);

  // Protected Modules Routes
  app.use('/api/products', authMiddleware, productRoutes);
  app.use('/api/orders', orderRoutes);
  app.use('/api/logs', logRoutes);

  // Handle 404 - Not Found for unhandled routes
  app.use((req: Request, res: Response, next) => {
    next(new NotFoundError(`Route ${req.method} ${req.originalUrl} not found`));
  });

  // Global Error Handler
  app.use(errorHandler);

  return app;
};
