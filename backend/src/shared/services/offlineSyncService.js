/**
 * Offline-sync service (blueprint §10; SATHI pattern).
 *
 * The app replays its local write queue here. Guarantees:
 *   - IDEMPOTENT: replaying an op (same op_uuid) never double-applies.
 *   - SERVER-WINS: an UPDATE whose client_ts predates the server row's last
 *     change is rejected as CONFLICT; the server value stands and the loser is
 *     recorded in conflict_detail for the app to notify the farmer.
 *   - every applied op appends a domain_event (outbox).
 *
 * Offline-queue state machine (server side):
 *   RECEIVED → APPLIED | CONFLICT | FAILED | DUPLICATE
 */
const { emitDomainEvent } = require('./domainEvents');

let db;
const getDb = () => { if (!db) db = require('../models'); return db; };

// Entity types the queue may apply, mapped to their model + event name.
// Phase 0: the voice-first logbook entities. Extend per phase.
const APPLIERS = {
  DairyCostEvent: { model: 'DairyCostEvent', event: 'dairy.cost.logged' },
  DairyRevenueEvent: { model: 'DairyRevenueEvent', event: 'dairy.revenue.logged' },
};

/**
 * Apply a batch of client ops.
 * @param {object} args { userId, deviceId, ops:[{opUuid, entityType, entityRef, action, payload, clientTs}] }
 * @returns {Promise<Array<{opUuid, status, conflict?}>>}
 */
const pushOps = async ({ userId = null, deviceId = null, ops = [] }) => {
  const results = [];
  for (const op of ops) {
    results.push(await applyOne({ userId, deviceId, op }));
  }
  return results;
};

const applyOne = async ({ userId, deviceId, op }) => {
  const database = getDb();
  const { SyncQueueItem } = database;

  // Idempotency: op already landed?
  const existing = await SyncQueueItem.findOne({ where: { op_uuid: op.opUuid } });
  if (existing) {
    return { opUuid: op.opUuid, status: 'DUPLICATE', queueId: existing.id };
  }

  const applier = APPLIERS[op.entityType];
  const t = await database.sequelize.transaction();
  try {
    const item = await SyncQueueItem.create({
      op_uuid: op.opUuid,
      user_id: userId,
      device_id: deviceId,
      entity_type: op.entityType,
      entity_ref: op.entityRef || null,
      action: op.action || 'CREATE',
      payload: op.payload || {},
      client_ts: op.clientTs,
      status: 'RECEIVED',
    }, { transaction: t });

    if (!applier) {
      await item.update({ status: 'FAILED', error_detail: `no applier for ${op.entityType}` }, { transaction: t });
      await t.commit();
      return { opUuid: op.opUuid, status: 'FAILED' };
    }
    const Model = database[applier.model];

    if ((op.action || 'CREATE') === 'UPDATE') {
      const target = op.entityRef
        ? await Model.findOne({ where: { event_uuid: op.entityRef }, transaction: t })
        : null;
      // SERVER-WINS: server changed after the client captured this op → conflict.
      // (Sequelize exposes the timestamp as updatedAt even with underscored:true.)
      if (target && new Date(target.updatedAt) > new Date(op.clientTs)) {
        const conflict = { serverUpdatedAt: target.updatedAt, clientTs: op.clientTs, clientPayload: op.payload };
        await item.update({ status: 'CONFLICT', conflict_detail: conflict }, { transaction: t });
        await t.commit();
        return { opUuid: op.opUuid, status: 'CONFLICT', conflict };
      }
      if (target) await target.update(op.payload, { transaction: t });
    } else {
      await Model.create(op.payload, { transaction: t });
    }

    await item.update({ status: 'APPLIED', applied_at: new Date() }, { transaction: t });
    await emitDomainEvent({
      eventType: applier.event,
      aggregateType: applier.model,
      aggregateId: op.entityRef || op.opUuid,
      farmerId: op.payload && op.payload.farmer_id,
      payload: { via: 'offline_sync', opUuid: op.opUuid },
    }, { transaction: t });

    await t.commit();
    return { opUuid: op.opUuid, status: 'APPLIED' };
  } catch (err) {
    await t.rollback();
    // Land a FAILED marker outside the rolled-back txn so retries are visible.
    await SyncQueueItem.create({
      op_uuid: op.opUuid, user_id: userId, device_id: deviceId,
      entity_type: op.entityType, entity_ref: op.entityRef || null,
      action: op.action || 'CREATE', payload: op.payload || {},
      client_ts: op.clientTs, status: 'FAILED', error_detail: err.message,
    }).catch(() => {});
    return { opUuid: op.opUuid, status: 'FAILED', error: err.message };
  }
};

module.exports = { pushOps, APPLIERS };
