import { connectDatabase, sequelize } from '../config/database';
import { logger } from '../shared/helpers/logger';
import { seedAdminUser } from '../modules/auth/seeders/adminSeeder';
import { seedPaymentMappings } from '../modules/orders/seeders/paymentSeeder';

// Load every model before synchronizing. This is an explicit deployment action;
// the application process never alters the production schema on startup.
import '../modules/auth/models/User';
import '../modules/products/models/Product';
import '../modules/products/models/ProductMapping';
import '../modules/products/models/SyncLog';
import '../modules/orders/models/Order';
import '../modules/orders/models/OrderItem';
import '../modules/orders/models/PaymentMapping';
import '../shared/models/SystemSetting';

const migrate = async (): Promise<void> => {
  try {
    await connectDatabase();
    logger.info('🚀 Running database migration (creating/altering tables and columns)...');
    await sequelize.sync({ alter: true });
    logger.info('✅ All database tables and columns are created and synchronized.');

    // Seed default admin and payment mappings
    await seedAdminUser();
    await seedPaymentMappings();
    logger.info('✅ Initial seeds applied successfully.');

    await sequelize.close();
    logger.info('🎉 Database migration completed successfully.');
  } catch (error) {
    logger.error('Database migration failed:', error);
    process.exit(1);
  }
};

migrate();
