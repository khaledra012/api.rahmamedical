import { connectDatabase, sequelize } from '../config/database';
import { DataTypes } from 'sequelize';
import { logger } from '../shared/helpers/logger';
import { seedAdminUser } from '../modules/auth/seeders/adminSeeder';
import { seedPaymentMappings } from '../modules/orders/seeders/paymentSeeder';
import { seedShippingTreasuryMappings } from '../modules/orders/seeders/shippingTreasurySeeder';

// Load every model before synchronizing. This is an explicit deployment action;
// the application process never alters the production schema on startup.
import '../modules/auth/models/User';
import '../modules/products/models/Product';
import '../modules/products/models/ProductMapping';
import '../modules/products/models/SyncLog';
import '../modules/orders/models/Order';
import '../modules/orders/models/OrderItem';
import '../modules/orders/models/PaymentMapping';
import '../modules/orders/models/ShippingTreasuryMapping';
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

    if (tables.includes('orders')) {
      const orderColumns = await queryInterface.describeTable('orders');
      const addOrderColumn = async (name: string, definition: any) => {
        if (!orderColumns[name]) {
          await queryInterface.addColumn('orders', name, definition);
        }
      };

      await addOrderColumn('shipping_method_id', { type: DataTypes.STRING(100), allowNull: true });
      await addOrderColumn('shipping_method_name', { type: DataTypes.STRING(255), allowNull: true });
      await addOrderColumn('zid_order_status', { type: DataTypes.STRING(100), allowNull: true });
      await addOrderColumn('shipping_status', { type: DataTypes.STRING(255), allowNull: true });
      await addOrderColumn('shipping_status_updated_at', { type: DataTypes.DATE, allowNull: true });
      await addOrderColumn('cod_settlement_status', {
        type: DataTypes.STRING(40),
        allowNull: false,
        defaultValue: 'NOT_APPLICABLE',
      });
      await addOrderColumn('cod_settlement_message', { type: DataTypes.TEXT, allowNull: true });
      await addOrderColumn('cod_treasury_id', { type: DataTypes.INTEGER, allowNull: true });
      await addOrderColumn('cod_settlement_started_at', { type: DataTypes.DATE, allowNull: true });
      await addOrderColumn('cod_settled_at', { type: DataTypes.DATE, allowNull: true });
      await addOrderColumn('daftra_payment_id', { type: DataTypes.STRING(100), allowNull: true });
    }

    // Creates new tables on first deployment without repeatedly altering existing tables.
    await sequelize.sync();
    logger.info('✅ Required database tables and columns are ready.');

    // Seed default admin and payment mappings
    await seedAdminUser();
    await seedPaymentMappings();
    await seedShippingTreasuryMappings();
    logger.info('✅ Initial seeds applied successfully.');

    await sequelize.close();
    logger.info('🎉 Database migration completed successfully.');
  } catch (error) {
    logger.error('Database migration failed:', error);
    process.exit(1);
  }
};

migrate();
