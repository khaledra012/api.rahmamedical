import { connectDatabase, sequelize } from '../config/database';
import { orderPollerService } from '../modules/orders/services/OrderPollerService';
import { SystemSetting } from '../shared/models/SystemSetting';
import { Order } from '../modules/orders/models/Order';
import { logger } from '../shared/helpers';

// Load models
import '../modules/auth/models/User';
import '../modules/products/models/Product';
import '../modules/products/models/ProductMapping';
import '../modules/products/models/SyncLog';
import '../modules/orders/models/Order';
import '../modules/orders/models/OrderItem';
import '../modules/orders/models/PaymentMapping';
import '../shared/models/SystemSetting';

const runSync = async (): Promise<void> => {
  try {
    await connectDatabase();

    // Set orders_last_polled_at to Sept 23, 2026 18:00:00 UTC
    // (which is 39 minutes before the last processed order #110 on Sept 23 18:39 UTC)
    const rewindTimestamp = '2026-09-23T18:00:00.000Z';
    logger.info(`Setting orders_last_polled_at to ${rewindTimestamp}...`);
    await SystemSetting.setValue('orders_last_polled_at', rewindTimestamp);

    logger.info('🚀 Starting order poller catch-up run...');
    const result = await orderPollerService.pollOrdersNow('MANUAL');
    logger.info('========================================');
    logger.info('POLL EXECUTION RESULT:');
    logger.info(`  Processed: ${result.processedCount}`);
    logger.info(`  Skipped:   ${result.skippedCount}`);
    logger.info(`  Errors:    ${result.errorsCount}`);
    logger.info('========================================');

    // Query all orders created on or after Sept 23
    const recentOrders = await Order.findAll({
      where: sequelize.literal("created_at >= '2026-09-23 18:00:00'"),
      order: [['id', 'DESC']],
    });

    console.log(`\nTotal orders in DB since Sept 23: ${recentOrders.length}`);
    console.table(
      recentOrders.map((o) => ({
        id: o.id,
        storeOrderId: o.storeOrderId,
        customerName: o.customerName,
        status: o.status,
        invoiceNumber: o.daftraInvoiceNumber,
        invoiceId: o.daftraDraftInvoiceId,
        totalAmount: o.totalAmount,
        statusMessage: o.statusMessage,
      }))
    );

    await sequelize.close();
    process.exit(0);
  } catch (error) {
    logger.error('Catch-up poller failed:', error);
    process.exit(1);
  }
};

runSync();
