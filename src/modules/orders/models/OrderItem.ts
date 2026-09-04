import { Model, DataTypes, Optional } from 'sequelize';
import { sequelize } from '../../../config/database';

export interface OrderItemAttributes {
  id: number;
  orderId: number;
  sku: string;
  barcode: string | null;
  productName: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  taxPercentage: number;
  lineTotal: number;
  daftraProductId: number | null;
  matchStatus: 'MATCHED' | 'UNMATCHED';
  createdAt?: Date;
  updatedAt?: Date;
}

export interface OrderItemCreationAttributes
  extends Optional<
    OrderItemAttributes,
    'id' | 'barcode' | 'discount' | 'taxPercentage' | 'daftraProductId' | 'matchStatus' | 'createdAt' | 'updatedAt'
  > {}

export class OrderItem
  extends Model<OrderItemAttributes, OrderItemCreationAttributes>
  implements OrderItemAttributes
{
  declare id: number;
  declare orderId: number;
  declare sku: string;
  declare barcode: string | null;
  declare productName: string;
  declare quantity: number;
  declare unitPrice: number;
  declare discount: number;
  declare taxPercentage: number;
  declare lineTotal: number;
  declare daftraProductId: number | null;
  declare matchStatus: 'MATCHED' | 'UNMATCHED';
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

OrderItem.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    orderId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    sku: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    barcode: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    productName: {
      type: DataTypes.STRING(500),
      allowNull: false,
    },
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    unitPrice: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      get() {
        const val = this.getDataValue('unitPrice');
        return val ? parseFloat(val as any) : 0;
      },
    },
    discount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
      get() {
        const val = this.getDataValue('discount');
        return val ? parseFloat(val as any) : 0;
      },
    },
    taxPercentage: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 15,
      get() {
        const val = this.getDataValue('taxPercentage');
        return val ? parseFloat(val as any) : 0;
      },
    },
    lineTotal: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      get() {
        const val = this.getDataValue('lineTotal');
        return val ? parseFloat(val as any) : 0;
      },
    },
    daftraProductId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    matchStatus: {
      type: DataTypes.ENUM('MATCHED', 'UNMATCHED'),
      allowNull: false,
      defaultValue: 'UNMATCHED',
    },
  },
  {
    sequelize,
    tableName: 'order_items',
    timestamps: true,
    underscored: true,
  }
);
