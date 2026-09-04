import { Model, DataTypes, Optional } from 'sequelize';
import { sequelize } from '../../../config/database';
import { PublishStatus } from '../dtos/product.dtos';

export interface ProductAttributes {
  id: number;
  daftraProductId: number;
  sku: string;
  barcode: string | null;
  nameAr: string;
  nameEn: string | null;
  descriptionAr: string | null;
  descriptionEn: string | null;
  price: number;
  costPrice: number | null;
  salePrice: number | null;
  stockQuantity: number;
  daftraStorehouseId: number | null;
  weight: number | null;
  isTaxable: boolean;
  taxPercentage: number | null;
  daftraCategory: string | null;
  zidCategoryIds: number[] | null;
  trendyolCategoryId: number | null;
  trendyolBrandId: number | null;
  images: string[] | null;
  seoKeywords: string | null;
  publishStatus: PublishStatus;
  publishError: string | null;
  trendyolStatus: PublishStatus;
  trendyolError: string | null;
  rawDaftraData: object;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ProductCreationAttributes
  extends Optional<
    ProductAttributes,
    | 'id'
    | 'barcode'
    | 'nameEn'
    | 'descriptionAr'
    | 'descriptionEn'
    | 'costPrice'
    | 'salePrice'
    | 'stockQuantity'
    | 'daftraStorehouseId'
    | 'weight'
    | 'isTaxable'
    | 'taxPercentage'
    | 'daftraCategory'
    | 'zidCategoryIds'
    | 'trendyolCategoryId'
    | 'trendyolBrandId'
    | 'images'
    | 'seoKeywords'
    | 'publishStatus'
    | 'publishError'
    | 'trendyolStatus'
    | 'trendyolError'
    | 'createdAt'
    | 'updatedAt'
  > {}

export class Product extends Model<ProductAttributes, ProductCreationAttributes> implements ProductAttributes {
  declare id: number;
  declare daftraProductId: number;
  declare sku: string;
  declare barcode: string | null;
  declare nameAr: string;
  declare nameEn: string | null;
  declare descriptionAr: string | null;
  declare descriptionEn: string | null;
  declare price: number;
  declare costPrice: number | null;
  declare salePrice: number | null;
  declare stockQuantity: number;
  declare daftraStorehouseId: number | null;
  declare weight: number | null;
  declare isTaxable: boolean;
  declare taxPercentage: number | null;
  declare daftraCategory: string | null;
  declare zidCategoryIds: number[] | null;
  declare trendyolCategoryId: number | null;
  declare trendyolBrandId: number | null;
  declare images: string[] | null;
  declare seoKeywords: string | null;
  declare publishStatus: PublishStatus;
  declare publishError: string | null;
  declare trendyolStatus: PublishStatus;
  declare trendyolError: string | null;
  declare rawDaftraData: object;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

Product.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    daftraProductId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true,
    },
    sku: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    barcode: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    nameAr: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    nameEn: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    descriptionAr: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    descriptionEn: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    price: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0.0,
      get() {
        const val = this.getDataValue('price');
        return val ? parseFloat(val as any) : 0;
      },
    },
    costPrice: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
      get() {
        const val = this.getDataValue('costPrice');
        return val ? parseFloat(val as any) : null;
      },
    },
    salePrice: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
      get() {
        const val = this.getDataValue('salePrice');
        return val ? parseFloat(val as any) : null;
      },
    },
    stockQuantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    daftraStorehouseId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    weight: {
      type: DataTypes.DECIMAL(10, 3),
      allowNull: true,
      get() {
        const val = this.getDataValue('weight');
        return val ? parseFloat(val as any) : null;
      },
    },
    isTaxable: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    taxPercentage: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
      get() {
        const val = this.getDataValue('taxPercentage');
        return val ? parseFloat(val as any) : null;
      },
    },
    daftraCategory: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    zidCategoryIds: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: [],
    },
    trendyolCategoryId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    trendyolBrandId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    images: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: [],
    },
    seoKeywords: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    publishStatus: {
      type: DataTypes.ENUM('PENDING_REVIEW', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'PAUSED'),
      allowNull: false,
      defaultValue: 'PENDING_REVIEW',
    },
    publishError: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    trendyolStatus: {
      type: DataTypes.ENUM('PENDING_REVIEW', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'PAUSED'),
      allowNull: false,
      defaultValue: 'PENDING_REVIEW',
    },
    trendyolError: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    rawDaftraData: {
      type: DataTypes.JSON,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: 'products',
    timestamps: true,
    underscored: true,
  }
);
