import { Sequelize } from 'sequelize';
import mysql from 'mysql2/promise';
import { env } from './env';
import { logger } from '../shared/helpers/logger';

export const sequelize = new Sequelize(
  env.db.name,
  env.db.user,
  env.db.password,
  {
    host: env.db.host,
    port: env.db.port,
    dialect: 'mysql',
    logging: env.nodeEnv === 'development' ? false : false,
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
    define: {
      timestamps: true,
      underscored: true,
    },
  }
);

/**
 * Ensure the MySQL database exists before Sequelize connects
 */
const ensureDatabaseExists = async (): Promise<void> => {
  try {
    const connection = await mysql.createConnection({
      host: env.db.host,
      port: env.db.port,
      user: env.db.user,
      password: env.db.password,
    });
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${env.db.name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    await connection.end();
  } catch (error) {
    logger.warn('Could not auto-create database schema:', error);
  }
};

export const connectDatabase = async (): Promise<void> => {
  try {
    await ensureDatabaseExists();
    await sequelize.authenticate();
    logger.info(`✅ MySQL Database connection established successfully (${env.db.name} on ${env.db.host}:${env.db.port})`);
  } catch (error) {
    logger.error('❌ Unable to connect to the MySQL database:', error);
    if (env.nodeEnv === 'production') {
      process.exit(1);
    }
  }
};

export const syncDatabase = async (force: boolean = false): Promise<void> => {
  if (env.nodeEnv === 'production') {
    logger.info('Skipping automatic schema synchronization in production. Run npm run db:migrate during deployment.');
    return;
  }
  try {
    await sequelize.sync({ force, alter: env.nodeEnv === 'development' });
    logger.info('✅ Database models synchronized successfully.');
  } catch (error) {
    logger.error('❌ Database sync failed:', error);
  }
};
