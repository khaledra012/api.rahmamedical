import { Model, DataTypes } from 'sequelize';
import { sequelize } from '../../config/database';

export interface SystemSettingAttributes {
  settingKey: string;
  settingValue: string;
  description?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export class SystemSetting
  extends Model<SystemSettingAttributes>
  implements SystemSettingAttributes
{
  declare settingKey: string;
  declare settingValue: string;
  declare description: string | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  /**
   * جلب قيمة إعداد معين
   */
  public static async getValue(key: string, defaultValue: string | null = null): Promise<string | null> {
    const setting = await SystemSetting.findByPk(key);
    return setting ? setting.settingValue : defaultValue;
  }

  /**
   * حفظ أو تحديث إعداد معين
   */
  public static async setValue(key: string, value: string, description?: string): Promise<void> {
    const [setting] = await SystemSetting.findOrCreate({
      where: { settingKey: key },
      defaults: { settingKey: key, settingValue: value, description: description || null },
    });
    setting.settingValue = value;
    if (description) setting.description = description;
    await setting.save();
  }

  /**
   * نقطة البداية الصفرية للنظام (Startup Baseline Watermark)
   * تضمن ألا يسحب النظام أي طلب أو عملية قديمة قبل تاريخ أول تشغيل
   */
  public static async getOrCreateBaselineDate(): Promise<Date> {
    const key = 'system_baseline_date';
    const existing = await SystemSetting.getValue(key);
    if (existing) {
      return new Date(existing);
    }
    const now = new Date();
    await SystemSetting.setValue(key, now.toISOString(), 'تاريخ تشغيل النظام لأول مرة - يمنع معالجة أي بيانات سابقة له');
    return now;
  }
}

SystemSetting.init(
  {
    settingKey: {
      type: DataTypes.STRING(100),
      primaryKey: true,
      allowNull: false,
    },
    settingValue: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    description: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'system_settings',
    timestamps: true,
    underscored: true,
  }
);
