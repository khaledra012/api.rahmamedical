import { Model, DataTypes, Optional } from 'sequelize';
import { sequelize } from '../../../config/database';

export interface PaymentMappingAttributes {
  id: number;
  paymentMethodKey: string;
  paymentMethodLabel: string;
  treasuryId: number;
  treasuryName: string;
  storeType: 'ZID' | 'TRENDYOL' | 'ALL';
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface PaymentMappingCreationAttributes
  extends Optional<PaymentMappingAttributes, 'id' | 'storeType' | 'isActive' | 'createdAt' | 'updatedAt'> {}

export class PaymentMapping
  extends Model<PaymentMappingAttributes, PaymentMappingCreationAttributes>
  implements PaymentMappingAttributes
{
  declare id: number;
  declare paymentMethodKey: string;
  declare paymentMethodLabel: string;
  declare treasuryId: number;
  declare treasuryName: string;
  declare storeType: 'ZID' | 'TRENDYOL' | 'ALL';
  declare isActive: boolean;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

PaymentMapping.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    paymentMethodKey: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
    },
    paymentMethodLabel: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    treasuryId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    treasuryName: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    storeType: {
      type: DataTypes.ENUM('ZID', 'TRENDYOL', 'ALL'),
      allowNull: false,
      defaultValue: 'ALL',
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    sequelize,
    tableName: 'payment_mappings',
    timestamps: true,
    underscored: true,
  }
);

// ──────────────────────────────────────────────────────────────────
// Default Payment Mapping Seed Data (بيانات جدول المطابقة المعتمدة)
// ──────────────────────────────────────────────────────────────────
export const DEFAULT_PAYMENT_MAPPINGS = [
  { paymentMethodKey: 'tabby', paymentMethodLabel: 'تابي (Tabby)', treasuryId: 19, treasuryName: 'tabby', storeType: 'ZID' as const },
  { paymentMethodKey: 'tabby_installments', paymentMethodLabel: 'أقساط تابي (Tabby)', treasuryId: 19, treasuryName: 'tabby', storeType: 'ZID' as const },
  { paymentMethodKey: 'tamara', paymentMethodLabel: 'تمارا (Tamara)', treasuryId: 21, treasuryName: 'tamara', storeType: 'ZID' as const },
  { paymentMethodKey: 'tamara_pay', paymentMethodLabel: 'تمارا (Tamara)', treasuryId: 21, treasuryName: 'tamara', storeType: 'ZID' as const },
  { paymentMethodKey: 'tamara_installments', paymentMethodLabel: 'أقساط تمارا', treasuryId: 21, treasuryName: 'tamara', storeType: 'ZID' as const },
  { paymentMethodKey: 'zidpay', paymentMethodLabel: 'ZidPay / مدى / بطاقات', treasuryId: 18, treasuryName: 'zidpay', storeType: 'ZID' as const },
  { paymentMethodKey: 'mada', paymentMethodLabel: 'مدى (Mada)', treasuryId: 18, treasuryName: 'zidpay', storeType: 'ZID' as const },
  { paymentMethodKey: 'visa', paymentMethodLabel: 'فيزا (Visa)', treasuryId: 18, treasuryName: 'zidpay', storeType: 'ZID' as const },
  { paymentMethodKey: 'mastercard', paymentMethodLabel: 'ماستركارد (Mastercard)', treasuryId: 18, treasuryName: 'zidpay', storeType: 'ZID' as const },
  { paymentMethodKey: 'applepay', paymentMethodLabel: 'أبل باي (Apple Pay)', treasuryId: 18, treasuryName: 'zidpay', storeType: 'ZID' as const },
  { paymentMethodKey: 'apple_pay', paymentMethodLabel: 'أبل باي (Apple Pay)', treasuryId: 18, treasuryName: 'zidpay', storeType: 'ZID' as const },
  { paymentMethodKey: 'stcpay', paymentMethodLabel: 'STC Pay', treasuryId: 18, treasuryName: 'zidpay', storeType: 'ZID' as const },
  { paymentMethodKey: 'stc_pay', paymentMethodLabel: 'STC Pay', treasuryId: 18, treasuryName: 'zidpay', storeType: 'ZID' as const },
  { paymentMethodKey: 'credit_card', paymentMethodLabel: 'بطاقة ائتمان', treasuryId: 18, treasuryName: 'zidpay', storeType: 'ZID' as const },
  { paymentMethodKey: 'cod', paymentMethodLabel: 'الدفع عند الاستلام (COD)', treasuryId: 35, treasuryName: 'تسوية الدفع عند الاستلام', storeType: 'ZID' as const },
  { paymentMethodKey: 'cash_on_delivery', paymentMethodLabel: 'الدفع عند الاستلام (COD)', treasuryId: 35, treasuryName: 'تسوية الدفع عند الاستلام', storeType: 'ZID' as const },
  { paymentMethodKey: 'zid_cod', paymentMethodLabel: 'الدفع عند الاستلام (COD)', treasuryId: 35, treasuryName: 'تسوية الدفع عند الاستلام', storeType: 'ZID' as const },
  { paymentMethodKey: 'zid_cop', paymentMethodLabel: 'الدفع عند الاستلام من الفرع (ZID COP)', treasuryId: 31, treasuryName: 'zid_cop', storeType: 'ZID' as const },
  { paymentMethodKey: 'bank_transfer', paymentMethodLabel: 'تحويل بنكي', treasuryId: 18, treasuryName: 'zidpay', storeType: 'ZID' as const },
  { paymentMethodKey: 'trendyol_prepaid', paymentMethodLabel: 'تسوية ترينديول (Prepaid)', treasuryId: 25, treasuryName: 'prepaid_trendyol', storeType: 'TRENDYOL' as const },
];
