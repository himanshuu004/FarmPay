/**
 * SyncQueueItem — server-side landing table for the offline-first write queue
 * (blueprint §10; SATHI sync pattern). The farmer app and field PWA write
 * logbook entries / receipts / evidence to a LOCAL queue with no signal, then
 * replay them here when connectivity returns.
 *
 * Idempotency: each client op carries a client-generated op_uuid; replaying the
 * same op is a no-op. Conflicts resolve SERVER-WINS, and the loser is recorded
 * so the app can notify the farmer (blueprint offline-queue state machine:
 * QUEUED_LOCAL → SYNCING → SYNCED | CONFLICT).
 */
const { Model } = require('sequelize');

const SYNC_STATUSES = ['RECEIVED', 'APPLIED', 'CONFLICT', 'FAILED', 'DUPLICATE'];

module.exports = (sequelize, DataTypes) => {
  class SyncQueueItem extends Model {
    static associate(models) {
      if (models.User) {
        SyncQueueItem.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
      }
    }
  }
  SyncQueueItem.init({
    id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
    // Client-generated, globally unique — the idempotency key.
    op_uuid: { type: DataTypes.UUID, allowNull: false, unique: true },
    user_id: { type: DataTypes.INTEGER, allowNull: true },
    device_id: { type: DataTypes.STRING(64), allowNull: true },
    // What the op targets: entity kind + client-intended action.
    entity_type: { type: DataTypes.STRING(60), allowNull: false }, // 'DairyCostEvent', 'CoopInputOrder', …
    entity_ref: { type: DataTypes.STRING(64), allowNull: true },
    action: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'CREATE' }, // CREATE|UPDATE
    payload: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    // Ordering / conflict inputs.
    client_ts: { type: DataTypes.DATE, allowNull: false },
    status: { type: DataTypes.ENUM(...SYNC_STATUSES), allowNull: false, defaultValue: 'RECEIVED' },
    conflict_detail: { type: DataTypes.JSONB, allowNull: true }, // server-wins loser payload, for farmer notify
    applied_at: { type: DataTypes.DATE, allowNull: true },
    error_detail: { type: DataTypes.TEXT, allowNull: true },
  }, {
    sequelize, modelName: 'SyncQueueItem', tableName: 'sync_queue_items',
    timestamps: true, underscored: true,
    indexes: [
      { unique: true, fields: ['op_uuid'] },
      { fields: ['user_id', 'status'] },
      { fields: ['entity_type', 'entity_ref'] },
    ],
  });
  SyncQueueItem.SYNC_STATUSES = SYNC_STATUSES;
  return SyncQueueItem;
};
