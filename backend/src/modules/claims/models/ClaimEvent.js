/**
 * ClaimEvent — the append-only, HASH-CHAINED claim audit (§5.2; the spine of
 * trust). Every claim state change / evidence add appends one row:
 *
 *   event_hash = SHA256(prev_hash + stable(payload) + hashed_at)
 *
 * so any tamper (edit/insert/delete) breaks the chain. Immutable: instance AND
 * bulk update/delete are blocked (CLAUDE.md #8 — never UPDATE/DELETE), the same
 * defence the domain_events outbox uses.
 */
const { Model } = require('sequelize');

const ACTOR_ROLES = ['farmer', 'vet', 'surveyor', 'insurer_ops', 'system'];

module.exports = (sequelize, DataTypes) => {
  class ClaimEvent extends Model {
    static associate(models) {
      if (models.ClaimCase) ClaimEvent.belongsTo(models.ClaimCase, { foreignKey: 'claim_id', as: 'claim' });
    }
  }
  ClaimEvent.init({
    id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
    claim_id: { type: DataTypes.INTEGER, allowNull: false },
    event_type: { type: DataTypes.STRING(60), allowNull: false },
    actor_role: { type: DataTypes.ENUM(...ACTOR_ROLES), allowNull: false },
    actor_id: { type: DataTypes.INTEGER, allowNull: true },
    payload: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    prev_hash: { type: DataTypes.STRING(64), allowNull: false },
    event_hash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    hashed_at: { type: DataTypes.DATE, allowNull: false }, // the ts fed into the hash
  }, {
    sequelize, modelName: 'ClaimEvent', tableName: 'claim_events',
    timestamps: true, underscored: true, updatedAt: false, // append-only
    indexes: [
      { fields: ['claim_id'] },
      { unique: true, fields: ['event_hash'] },
      // Serialises appends per claim: only one event may link to a given prev_hash,
      // so a concurrent race cannot fork the chain (the loser's txn rolls back).
      { unique: true, fields: ['claim_id', 'prev_hash'] },
    ],
    hooks: {
      beforeUpdate: () => { throw new Error('claim_events is append-only (hash-chained; no update)'); },
      beforeBulkUpdate: () => { throw new Error('claim_events is append-only (hash-chained; no update)'); },
      beforeDestroy: () => { throw new Error('claim_events is append-only (no delete)'); },
      beforeBulkDestroy: () => { throw new Error('claim_events is append-only (no delete)'); },
    },
  });
  ClaimEvent.ACTOR_ROLES = ACTOR_ROLES;
  return ClaimEvent;
};
