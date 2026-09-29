import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../../../config/database';

export interface ShippingTreasuryMappingAttributes {
  id: number;
  shippingMethodId: string | null;
  shippingMethodName: string;
  treasuryId: number;
  treasuryName: string;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ShippingTreasuryMappingCreationAttributes
  extends Optional<
    ShippingTreasuryMappingAttributes,
    'id' | 'shippingMethodId' | 'isActive' | 'createdAt' | 'updatedAt'
  > {}

export class ShippingTreasuryMapping
  extends Model<ShippingTreasuryMappingAttributes, ShippingTreasuryMappingCreationAttributes>
  implements ShippingTreasuryMappingAttributes
{
  declare id: number;
  declare shippingMethodId: string | null;
  declare shippingMethodName: string;
  declare treasuryId: number;
  declare treasuryName: string;
  declare isActive: boolean;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

ShippingTreasuryMapping.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    shippingMethodId: {
      type: DataTypes.STRING(100),
      allowNull: true,
      unique: true,
    },
    shippingMethodName: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
    },
    treasuryId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    treasuryName: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    sequelize,
    tableName: 'shipping_treasury_mappings',
    timestamps: true,
    underscored: true,
  }
);

export const DEFAULT_SHIPPING_TREASURY_MAPPINGS = [
  { shippingMethodId: '410263', shippingMethodName: 'Tard Delivery', treasuryId: 32, treasuryName: 'tard delivery - cod' },
  { shippingMethodId: '476266', shippingMethodName: 'ارامكس | ثقيل', treasuryId: 37, treasuryName: 'ارامكس | ثقيل - cod' },
  { shippingMethodId: '710400', shippingMethodName: 'طيارة للخدمات اللوجستية', treasuryId: 34, treasuryName: 'طيارة للخدمات اللوجستية - cod' },
  { shippingMethodId: '733717', shippingMethodName: 'تريك', treasuryId: 33, treasuryName: 'تريك - cod' },
  { shippingMethodId: '788420', shippingMethodName: 'فاستلو', treasuryId: 38, treasuryName: 'فاستلو - cod' },
  { shippingMethodId: null, shippingMethodName: 'طيارة اكسبرس', treasuryId: 22, treasuryName: 'طيارة اكسبرس - cod' },
  { shippingMethodId: '410258', shippingMethodName: 'عادي', treasuryId: 20, treasuryName: 'عادي - cod' },
  { shippingMethodId: '473489', shippingMethodName: 'مندوب الرياض', treasuryId: 26, treasuryName: 'مندوب الرياض - cod' },
  { shippingMethodId: '593447', shippingMethodName: 'شقردي', treasuryId: 23, treasuryName: 'شقردي - cod' },
];
