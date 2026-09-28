import { connectDatabase, sequelize } from '../config/database';
import { DataTypes } from 'sequelize';
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
import '../modules/audit/models/AuditLog';
import '../shared/models/SystemSetting';

const migrate = async (): Promise<void> => {
  try {
    await connectDatabase();
    logger.info('🚀 Running explicit, repeatable database migration...');

    const queryInterface = sequelize.getQueryInterface();
    const tables = await queryInterface.showAllTables();

    if (tables.includes('users')) {
      const userColumns = await queryInterface.describeTable('users');
      if (!userColumns.username) {
        await queryInterface.addColumn('users', 'username', {
          type: DataTypes.STRING(80),
          allowNull: true,
        });
      }
      if (!userColumns.must_change_password) {
        await queryInterface.addColumn('users', 'must_change_password', {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        });
      }
      await queryInterface.changeColumn('users', 'role', {
        type: DataTypes.ENUM('admin', 'operator', 'viewer'),
        allowNull: false,
        defaultValue: 'admin',
      });
    }

    // Creates new tables on first deployment without repeatedly altering existing tables.
    await sequelize.sync();
    logger.info('✅ Required database tables and columns are ready.');

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
