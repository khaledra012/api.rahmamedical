import { User } from '../models/User';
import { logger } from '../../../shared/helpers/logger';

export const seedAdminUser = async (): Promise<void> => {
  try {
    const adminEmail = 'admin@daftra-sync.com';
    const adminUser = await User.findOne({ where: { email: adminEmail } });

    if (!adminUser) {
      await User.create({
        name: 'مدير النظام',
        email: adminEmail,
        password: 'Admin@2026',
        role: 'admin',
        isActive: true,
      });

      logger.info('🔑 Default Admin account created successfully:');
      logger.info('   Email:    admin@daftra-sync.com');
      logger.info('   Password: Admin@2026');
    } else {
      logger.info('🔑 Admin account already exists. Credentials preserved.');
    }
  } catch (error) {
    logger.error('Failed to seed default admin user:', error);
  }
};
