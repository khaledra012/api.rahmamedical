import { Model, DataTypes, Optional } from 'sequelize';
import { sequelize } from '../../../config/database';
import { CodSettlementStatus, OrderStatus, StoreType } from '../dtos/order.dtos';

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
  shippingMethodId: string | null;
  shippingMethodName: string | null;
  zidOrderStatus: string | null;
  shippingStatus: string | null;
  shippingStatusUpdatedAt: Date | null;
  codSettlementStatus: CodSettlementStatus;
  codSettlementMessage: string | null;
  codTreasuryId: number | null;
  codSettlementStartedAt: Date | null;
  codSettledAt: Date | null;
  daftraPaymentId: string | null;
  subtotal: number;
  shippingFee: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  status: OrderStatus;
  statusMessage: string | null;
  daftraDraftInvoiceId: number | null;
  daftraInvoiceNumber: string | null;
  daftraRefundReceiptId: number | null;
  daftraRefundReceiptNumber: string | null;
  cancellationReason: string | null;
  cancelledAt: Date | null;
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
    | 'shippingMethodId'
    | 'shippingMethodName'
    | 'zidOrderStatus'
    | 'shippingStatus'
    | 'shippingStatusUpdatedAt'
    | 'codSettlementStatus'
    | 'codSettlementMessage'
    | 'codTreasuryId'
    | 'codSettlementStartedAt'
    | 'codSettledAt'
    | 'daftraPaymentId'
    | 'subtotal'
    | 'shippingFee'
    | 'discountAmount'
    | 'taxAmount'
    | 'status'
    | 'statusMessage'
    | 'daftraDraftInvoiceId'
    | 'daftraInvoiceNumber'
    | 'daftraRefundReceiptId'
    | 'daftraRefundReceiptNumber'
    | 'cancellationReason'
    | 'cancelledAt'
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
  declare shippingMethodId: string | null;
  declare shippingMethodName: string | null;
  declare zidOrderStatus: string | null;
  declare shippingStatus: string | null;
  declare shippingStatusUpdatedAt: Date | null;
  declare codSettlementStatus: CodSettlementStatus;
  declare codSettlementMessage: string | null;
  declare codTreasuryId: number | null;
  declare codSettlementStartedAt: Date | null;
  declare codSettledAt: Date | null;
  declare daftraPaymentId: string | null;
  declare subtotal: number;
  declare shippingFee: number;
  declare discountAmount: number;
  declare taxAmount: number;
  declare totalAmount: number;
  declare status: OrderStatus;
  declare statusMessage: string | null;
  declare daftraDraftInvoiceId: number | null;
  declare daftraInvoiceNumber: string | null;
  declare daftraRefundReceiptId: number | null;
  declare daftraRefundReceiptNumber: string | null;
  declare cancellationReason: string | null;
  declare cancelledAt: Date | null;
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
    shippingMethodId: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    shippingMethodName: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    zidOrderStatus: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    shippingStatus: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    shippingStatusUpdatedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    codSettlementStatus: {
      type: DataTypes.STRING(40),
      allowNull: false,
      defaultValue: 'NOT_APPLICABLE',
    },
    codSettlementMessage: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    codTreasuryId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    codSettlementStartedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    codSettledAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    daftraPaymentId: {
      type: DataTypes.STRING(100),
      allowNull: true,
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
        'SKIPPED',
        'CANCEL_PENDING',
        'CANCELLED',
        'CANCEL_FAILED',
        'CANCEL_REVIEW_REQUIRED'
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
    daftraRefundReceiptId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    daftraRefundReceiptNumber: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    cancellationReason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    cancelledAt: {
      type: DataTypes.DATE,
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
