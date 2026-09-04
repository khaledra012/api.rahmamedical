import { PaymentMapping, DEFAULT_PAYMENT_MAPPINGS } from '../models/PaymentMapping';
import { logger } from '../../../shared/helpers/logger';

export const seedPaymentMappings = async (): Promise<void> => {
  try {
    for (const mapping of DEFAULT_PAYMENT_MAPPINGS) {
      const exists = await PaymentMapping.findOne({
        where: { paymentMethodKey: mapping.paymentMethodKey },
      });

      if (!exists) {
        await PaymentMapping.create(mapping);
        logger.info(`[PaymentSeeder] Seeded payment mapping: ${mapping.paymentMethodKey} -> Treasury #${mapping.treasuryId}`);
      }
    }
    logger.info('[PaymentSeeder] Payment mappings verified and ready.');
  } catch (error: any) {
    logger.error('[PaymentSeeder] Error seeding payment mappings:', error.message);
  }
};
