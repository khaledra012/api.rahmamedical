import {
  DEFAULT_SHIPPING_TREASURY_MAPPINGS,
  ShippingTreasuryMapping,
} from '../models/ShippingTreasuryMapping';
import { logger } from '../../../shared/helpers/logger';

const normalizeShippingName = (value: string): string =>
  String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();

export const seedShippingTreasuryMappings = async (): Promise<void> => {
  for (const mapping of DEFAULT_SHIPPING_TREASURY_MAPPINGS) {
    const existingRows = await ShippingTreasuryMapping.findAll();
    const existing = existingRows.find(
      (row) => normalizeShippingName(row.shippingMethodName) === normalizeShippingName(mapping.shippingMethodName)
    );

    if (!existing) {
      await ShippingTreasuryMapping.create(mapping);
      logger.info(
        `[ShippingTreasurySeeder] Seeded ${mapping.shippingMethodName} -> Treasury #${mapping.treasuryId}`
      );
    }
  }

  logger.info('[ShippingTreasurySeeder] Shipping treasury mappings verified and ready.');
};
