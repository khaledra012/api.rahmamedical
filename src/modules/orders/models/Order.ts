import { Model, DataTypes, Optional } from 'sequelize';
import { sequelize } from '../../../config/database';
import { OrderStatus, StoreType } from '../dtos/order.dtos';

export interface OrderAttributes {
  id: number;
  storeOrderId: string;
  storeType: StoreType;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  shippingAddress: string | null;
  paymentMethod: string;
  treasuryId: number | null;
  subtotal: number;
  shippingFee: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  status: OrderStatus;
  statusMessage: string | null;
  daftraDraftInvoiceId: number | null;
  daftraInvoiceNumber: string | null;
  orderDate: Date | null;
  rawOrderData: object;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface OrderCreationAttributes
  extends Optional<
    OrderAttributes,
    | 'id'
    | 'customerEmail'
    | 'shippingAddress'
    | 'treasuryId'
    | 'subtotal'
    | 'shippingFee'
    | 'discountAmount'
    | 'taxAmount'
    | 'status'
    | 'statusMessage'
    | 'daftraDraftInvoiceId'
    | 'daftraInvoiceNumber'
    | 'orderDate'
    | 'createdAt'
    | 'updatedAt'
  > {}

export class Order extends Model<OrderAttributes, OrderCreationAttributes> implements OrderAttributes {
  declare id: number;
  declare storeOrderId: string;
  declare storeType: StoreType;
  declare customerName: string;
  declare customerPhone: string;
  declare customerEmail: string | null;
  declare shippingAddress: string | null;
  declare paymentMethod: string;
  declare treasuryId: number | null;
  declare subtotal: number;
  declare shippingFee: number;
  declare discountAmount: number;
  declare taxAmount: number;
  declare totalAmount: number;
  declare status: OrderStatus;
  declare statusMessage: string | null;
  declare daftraDraftInvoiceId: number | null;
  declare daftraInvoiceNumber: string | null;
  declare orderDate: Date | null;
  declare rawOrderData: object;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

Order.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    storeOrderId: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true, // Idempotency UNIQUE constraint
    },
    storeType: {
      type: DataTypes.ENUM('ZID', 'TRENDYOL'),
      allowNull: false,
    },
    customerName: {
      type: DataTypes.STRING(255),
      allowNull: false,
      defaultValue: 'عميل',
    },
    customerPhone: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: '',
    },
    customerEmail: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    shippingAddress: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    paymentMethod: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    treasuryId: {
      type: DataTypes.INTEGER,
      allowNull: true, // null if UNMAPPED_PAYMENT
    },
    subtotal: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0.0,
      get() {
        const val = this.getDataValue('subtotal');
        return val ? parseFloat(val as any) : 0;
      },
    },
    shippingFee: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0.0,
      get() {
        const val = this.getDataValue('shippingFee');
        return val ? parseFloat(val as any) : 0;
      },
    },
    discountAmount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0.0,
      get() {
        const val = this.getDataValue('discountAmount');
        return val ? parseFloat(val as any) : 0;
      },
    },
    taxAmount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0.0,
      get() {
        const val = this.getDataValue('taxAmount');
        return val ? parseFloat(val as any) : 0;
      },
    },
    totalAmount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0.0,
      get() {
        const val = this.getDataValue('totalAmount');
        return val ? parseFloat(val as any) : 0;
      },
    },
    status: {
      type: DataTypes.ENUM(
        'PENDING_INVOICE',
        'PROCESSING',
        'DRAFT_CREATED',
        'UNMAPPED_PAYMENT',
        'UNMAPPED_PRODUCT',
        'FAILED',
        'SKIPPED'
      ),
      allowNull: false,
      defaultValue: 'PENDING_INVOICE',
    },
    statusMessage: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    daftraDraftInvoiceId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    daftraInvoiceNumber: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    orderDate: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    rawOrderData: {
      type: DataTypes.JSON,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: 'orders',
    timestamps: true,
    underscored: true,
  }
);
