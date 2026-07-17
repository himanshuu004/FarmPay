/**
 * ErpSyncLog — one row per ingested ERP batch/delta. The backbone of filedrop
 * reconciliation idempotency (blueprint §7.4, exit criterion for Phase 0).
 *
 * Idempotency: a re-dropped or duplicate file with the same content_checksum
 * is recognised and NOT re-applied. Late/out-of-order files are tolerated via
 * file_kind + sequence_no. Stage F builds the erpSyncJob that writes these.
 */
const { Model } = require('sequelize');

const FILE_KINDS = ['MEMBER_MASTER', 'MILK_SUMMARY', 'ORDER_STATUS', 'DISPATCH', 'KCC_CERTIFICATION'];
const STATUSES = ['RECEIVED', 'APPLIED', 'PARTIAL', 'FAILED', 'DUPLICATE_SKIPPED'];

module.exports = (sequelize, DataTypes) => {
  class ErpSyncLog extends Model {
    static associate() {}
  }
  ErpSyncLog.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    sync_uuid: { type: DataTypes.UUID, allowNull: false, unique: true },
    mode: { type: DataTypes.STRING(12), allowNull: false }, // filedrop|webhook|live|mock
    file_name: { type: DataTypes.STRING(255), allowNull: true },
    file_kind: { type: DataTypes.ENUM(...FILE_KINDS), allowNull: false },
    // Content hash — the idempotency key (a re-dropped identical file is skipped).
    content_checksum: { type: DataTypes.STRING(64), allowNull: false },
    sequence_no: { type: DataTypes.INTEGER, allowNull: true },
    rows_total: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    rows_applied: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    rows_skipped: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    rows_failed: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    status: { type: DataTypes.ENUM(...STATUSES), allowNull: false, defaultValue: 'RECEIVED' },
    error_detail: { type: DataTypes.JSONB, allowNull: true },
    received_at: { type: DataTypes.DATE, allowNull: true },
    applied_at: { type: DataTypes.DATE, allowNull: true },
  }, {
    sequelize, modelName: 'ErpSyncLog', tableName: 'erp_sync_log',
    timestamps: true, underscored: true,
    indexes: [
      { unique: true, fields: ['content_checksum'] }, // hard idempotency guard
      { fields: ['file_kind', 'sequence_no'] },
    ],
  });
  ErpSyncLog.FILE_KINDS = FILE_KINDS;
  ErpSyncLog.STATUSES = STATUSES;
  return ErpSyncLog;
};
