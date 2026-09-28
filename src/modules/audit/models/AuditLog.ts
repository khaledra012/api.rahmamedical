import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../../../config/database';

export interface AuditLogAttributes {
  id: number;
  userId: number | null;
  userName: string;
  userEmail: string | null;
  userRole: string | null;
  action: string;
  method: string;
  path: string;
  entityType: string | null;
  entityId: string | null;
  status: 'SUCCESS' | 'FAILED';
  statusCode: number;
  ipAddress: string | null;
  userAgent: string | null;
  details: object | null;
  createdAt?: Date;
}

export interface AuditLogCreationAttributes
  extends Optional<AuditLogAttributes, 'id' | 'userId' | 'userEmail' | 'userRole' | 'entityType' | 'entityId' | 'ipAddress' | 'userAgent' | 'details' | 'createdAt'> {}

export class AuditLog
  extends Model<AuditLogAttributes, AuditLogCreationAttributes>
  implements AuditLogAttributes
{
  declare id: number;
  declare userId: number | null;
  declare userName: string;
  declare userEmail: string | null;
  declare userRole: string | null;
  declare action: string;
  declare method: string;
  declare path: string;
  declare entityType: string | null;
  declare entityId: string | null;
  declare status: 'SUCCESS' | 'FAILED';
  declare statusCode: number;
  declare ipAddress: string | null;
  declare userAgent: string | null;
  declare details: object | null;
  declare readonly createdAt: Date;
}

AuditLog.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.INTEGER, allowNull: true },
    userName: { type: DataTypes.STRING(120), allowNull: false },
    userEmail: { type: DataTypes.STRING(150), allowNull: true },
    userRole: { type: DataTypes.STRING(30), allowNull: true },
    action: { type: DataTypes.STRING(80), allowNull: false },
    method: { type: DataTypes.STRING(10), allowNull: false },
    path: { type: DataTypes.STRING(500), allowNull: false },
    entityType: { type: DataTypes.STRING(50), allowNull: true },
    entityId: { type: DataTypes.STRING(100), allowNull: true },
    status: { type: DataTypes.ENUM('SUCCESS', 'FAILED'), allowNull: false },
    statusCode: { type: DataTypes.INTEGER, allowNull: false },
    ipAddress: { type: DataTypes.STRING(64), allowNull: true },
    userAgent: { type: DataTypes.STRING(500), allowNull: true },
    details: { type: DataTypes.JSON, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'audit_logs',
    timestamps: true,
    createdAt: 'createdAt',
    updatedAt: false,
    underscored: true,
    indexes: [
      { name: 'idx_audit_logs_user_created', fields: ['user_id', 'created_at'] },
      { name: 'idx_audit_logs_action_created', fields: ['action', 'created_at'] },
      { name: 'idx_audit_logs_status_created', fields: ['status', 'created_at'] },
    ],
  }
);
