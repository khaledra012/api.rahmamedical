import { createApp } from './app';
import { env } from './config/env';
import { connectDatabase } from './config/database';
import { seedAdminUser } from './modules/auth/seeders/adminSeeder';
import { seedPaymentMappings } from './modules/orders/seeders/paymentSeeder';
import { orderPollerService } from './modules/orders/services/OrderPollerService';
import { productPollerService } from './modules/products/services/ProductPollerService';
import { logger } from './shared/helpers/logger';

const startServer = async (): Promise<void> => {
  try {
    const app = createApp();

    // Connect to Database (Schema creation/alteration is strictly restricted to npm run db:migrate)
    await connectDatabase();

    // Seed default admin user if not already present
    await seedAdminUser();

    // Seed default payment mappings for Module 5 if not present
    await seedPaymentMappings();

    // Background Pollers: تم إيقاف سحب طلبات زد دورياً والاعتماد حصرياً على الويب هوك المباشر
    // orderPollerService.startPolling(5);
    productPollerService.startPolling(5); // فحص وتحديث منتجات ومخزون دفترة دورياً كل 5 دقائق


    // Start Express Server
    const server = app.listen(env.port, () => {
      logger.info(`🚀 Server running in ${env.nodeEnv} mode on http://localhost:${env.port}`);
      logger.info(`📊 Health check available at http://localhost:${env.port}/api/health`);
    });

    // Graceful Shutdown handling
    const gracefulShutdown = (signal: string) => {
      logger.info(`Received ${signal}. Shutting down gracefully...`);
      orderPollerService.stopPolling();
      productPollerService.stopPolling();
      server.close(() => {
        logger.info('HTTP server closed.');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Start the server if not imported by test runner
if (process.env.NODE_ENV !== 'test') {
  startServer();
}
