import { Model, DataTypes, Optional } from 'sequelize';
import { sequelize } from '../../../config/database';

export interface SyncLogAttributes {
  id: number;
  entityType: 'PRODUCT' | 'ORDER' | 'INVENTORY';
  entityId: number | null;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'RETRY';
  direction: 'DAFTRA_TO_ZID' | 'ZID_TO_DAFTRA' | 'TRENDYOL_TO_DAFTRA' | 'DAFTRA_TO_TRENDYOL';
  source: 'WEBHOOK' | 'MANUAL' | 'RETRY_ENGINE' | 'POLLER';
  requestUrl: string;
  requestMethod: string;
  requestPayload: object | null;
  responseStatus: number | null;
  responseBody: object | null;
  errorMessage: string | null;
  status: 'SUCCESS' | 'FAILED' | 'PENDING' | 'RETRYING';
  durationMs: number | null;
  retriesCount: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface SyncLogCreationAttributes
  extends Optional<
    SyncLogAttributes,
    | 'id'
    | 'entityId'
    | 'requestPayload'
    | 'responseStatus'
    | 'responseBody'
    | 'errorMessage'
    | 'durationMs'
    | 'retriesCount'
    | 'createdAt'
    | 'updatedAt'
  > {}

export class SyncLog
  extends Model<SyncLogAttributes, SyncLogCreationAttributes>
  implements SyncLogAttributes
{
  declare id: number;
  declare entityType: 'PRODUCT' | 'ORDER' | 'INVENTORY';
  declare entityId: number | null;
  declare action: 'CREATE' | 'UPDATE' | 'DELETE' | 'RETRY';
  declare direction: 'DAFTRA_TO_ZID' | 'ZID_TO_DAFTRA' | 'TRENDYOL_TO_DAFTRA' | 'DAFTRA_TO_TRENDYOL';
  declare source: 'WEBHOOK' | 'MANUAL' | 'RETRY_ENGINE' | 'POLLER';
  declare requestUrl: string;
  declare requestMethod: string;
  declare requestPayload: object | null;
  declare responseStatus: number | null;
  declare responseBody: object | null;
  declare errorMessage: string | null;
  declare status: 'SUCCESS' | 'FAILED' | 'PENDING' | 'RETRYING';
  declare durationMs: number | null;
  declare retriesCount: number;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

SyncLog.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    entityType: {
      type: DataTypes.ENUM('PRODUCT', 'ORDER', 'INVENTORY'),
      allowNull: false,
    },
    entityId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    action: {
      type: DataTypes.ENUM('CREATE', 'UPDATE', 'DELETE', 'RETRY'),
      allowNull: false,
    },
    direction: {
      type: DataTypes.ENUM('DAFTRA_TO_ZID', 'ZID_TO_DAFTRA', 'TRENDYOL_TO_DAFTRA', 'DAFTRA_TO_TRENDYOL'),
      allowNull: false,
    },
    source: {
      type: DataTypes.ENUM('WEBHOOK', 'MANUAL', 'RETRY_ENGINE', 'POLLER'),
      allowNull: false,
      defaultValue: 'MANUAL',
    },
    requestUrl: {
      type: DataTypes.STRING(500),
      allowNull: false,
    },
    requestMethod: {
      type: DataTypes.STRING(10),
      allowNull: false,
    },
    requestPayload: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    responseStatus: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    responseBody: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    errorMessage: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('SUCCESS', 'FAILED', 'PENDING', 'RETRYING'),
      allowNull: false,
      defaultValue: 'PENDING',
    },
    durationMs: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    retriesCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    sequelize,
    tableName: 'sync_logs',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        name: 'idx_sync_logs_status_created',
        fields: ['status', 'created_at'],
      },
      {
        name: 'idx_sync_logs_entity',
        fields: ['entity_type', 'entity_id'],
      },
      {
        name: 'idx_sync_logs_direction_created',
        fields: ['direction', 'created_at'],
      },
    ],
  }
);
