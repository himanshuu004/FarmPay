/**
 * DomainEvent — the append-only outbox (AI-0a).
 *
 * Every meaningful state change (register mutation, logbook entry, policy/claim
 * /order transition, drawdown) appends one row here in the SAME transaction as
 * the write. NEVER updated or deleted. Feeds: audit trail, RabbitMQ relay, and
 * the ML training flywheel (labels fall out of workflows).
 *
 * Immutability is enforced at the ORM layer by the hooks below — covering BOTH
 * the instance path (beforeUpdate/beforeDestroy) and the static bulk path
 * (beforeBulkUpdate/beforeBulkDestroy), since Model.update()/destroy() skip
 * instance hooks. The only permitted mutation is the relay stamping published_at.
 *
 * Defence-in-depth NOTE: a DB-level guard (REVOKE DELETE + column-scoped
 * GRANT UPDATE (published_at)) requires a dedicated NON-OWNER app role — the app
 * currently connects as the table owner, for whom REVOKE is a no-op. Wire that
 * role in when infra grows; until then these hooks are the enforcement.
 */
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class DomainEvent extends Model {
    static associate() {}
  }
  DomainEvent.init({
    id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
    event_uuid: { type: DataTypes.UUID, allowNull: false, unique: true },
    // e.g. 'livestock.animal.registered', 'coop.order.submitted', 'dairy.cost.logged'
    event_type: { type: DataTypes.STRING(80), allowNull: false },
    // The entity the event is about.
    aggregate_type: { type: DataTypes.STRING(60), allowNull: false }, // 'DairyAnimal', 'CoopInputOrder', …
    aggregate_id: { type: DataTypes.STRING(64), allowNull: false },
    farmer_id: { type: DataTypes.INTEGER, allowNull: true },
    payload: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    // Relay bookkeeping (RabbitMQ). Never mutated by business logic.
    occurred_at: { type: DataTypes.DATE, allowNull: false },
    published_at: { type: DataTypes.DATE, allowNull: true },
  }, {
    sequelize, modelName: 'DomainEvent', tableName: 'domain_events',
    timestamps: true, underscored: true, updatedAt: false, // append-only: no updated_at
    indexes: [
      { unique: true, fields: ['event_uuid'] },
      { fields: ['aggregate_type', 'aggregate_id'] },
      { fields: ['event_type'] },
      { fields: ['published_at'] }, // relay scans unpublished
    ],
    hooks: {
      beforeUpdate: (row) => {
        // Only the relay may stamp published_at; block all other mutations.
        if (row.changed().some((f) => f !== 'published_at')) {
          throw new Error('domain_events is append-only (only published_at may be set)');
        }
      },
      // Static Model.update(...) bypasses beforeUpdate (instance hook) entirely,
      // so guard the bulk path too: the relay's only legitimate bulk write is
      // stamping published_at. Anything else is tampering.
      beforeBulkUpdate: (options) => {
        const fields = Object.keys(options.attributes || {});
        if (fields.some((f) => f !== 'published_at')) {
          throw new Error('domain_events is append-only (only published_at may be set)');
        }
      },
      beforeDestroy: () => { throw new Error('domain_events is append-only (no delete)'); },
      beforeBulkDestroy: () => { throw new Error('domain_events is append-only (no delete)'); },
    },
  });
  return DomainEvent;
};
