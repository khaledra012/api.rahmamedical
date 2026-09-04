import { Model, DataTypes, Optional } from 'sequelize';
import { sequelize } from '../../../config/database';

export interface ProductMappingAttributes {
  id: number;
  productId: number;
  daftraProductId: number;
  zidProductId: string | null;
  trendyolProductId: string | null;
  trendyolBatchRequestId: string | null;
  sku: string;
  barcode: string | null;
  syncStatus: 'PENDING' | 'SYNCED' | 'FAILED' | 'UPDATING';
  trendyolStatus: 'PENDING' | 'SYNCED' | 'FAILED' | 'UPDATING';
  lastSyncedAt: Date | null;
  lastSyncedTrendyolAt: Date | null;
  lastError: string | null;
  lastTrendyolError: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ProductMappingCreationAttributes
  extends Optional<
    ProductMappingAttributes,
    | 'id'
    | 'zidProductId'
    | 'trendyolProductId'
    | 'trendyolBatchRequestId'
    | 'barcode'
    | 'syncStatus'
    | 'trendyolStatus'
    | 'lastSyncedAt'
    | 'lastSyncedTrendyolAt'
    | 'lastError'
    | 'lastTrendyolError'
    | 'createdAt'
    | 'updatedAt'
  > {}

export class ProductMapping
  extends Model<ProductMappingAttributes, ProductMappingCreationAttributes>
  implements ProductMappingAttributes
{
  declare id: number;
  declare productId: number;
  declare daftraProductId: number;
  declare zidProductId: string | null;
  declare trendyolProductId: string | null;
  declare trendyolBatchRequestId: string | null;
  declare sku: string;
  declare barcode: string | null;
  declare syncStatus: 'PENDING' | 'SYNCED' | 'FAILED' | 'UPDATING';
  declare trendyolStatus: 'PENDING' | 'SYNCED' | 'FAILED' | 'UPDATING';
  declare lastSyncedAt: Date | null;
  declare lastSyncedTrendyolAt: Date | null;
  declare lastError: string | null;
  declare lastTrendyolError: string | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

ProductMapping.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    productId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    daftraProductId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    zidProductId: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    trendyolProductId: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    trendyolBatchRequestId: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    sku: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    barcode: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    syncStatus: {
      type: DataTypes.ENUM('PENDING', 'SYNCED', 'FAILED', 'UPDATING'),
      allowNull: false,
      defaultValue: 'PENDING',
    },
    trendyolStatus: {
      type: DataTypes.ENUM('PENDING', 'SYNCED', 'FAILED', 'UPDATING'),
      allowNull: false,
      defaultValue: 'PENDING',
    },
    lastSyncedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    lastSyncedTrendyolAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    lastError: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    lastTrendyolError: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'product_mappings',
    timestamps: true,
    underscored: true,
  }
);
