/**
 * outboxRelayJob — the CIA outbox relay (PRD Part 11; closes the audit's
 * "nothing is ever dispatched" gap). Reads unpublished CIA domain_events, dispatches
 * a farmer notification inline, best-effort publishes to RabbitMQ (a decoupling seam
 * — the declared cia.stage.notify / cia.emi.default topics finally carry traffic),
 * and stamps published_at (the one mutation the append-only outbox permits).
 *
 * Plain function like ciaEmiReconcileJob (no scheduler runtime exists yet). Idempotent
 * by construction: WHERE published_at IS NULL selects each event exactly once, so a
 * re-run publishes/dispatches nothing already stamped. CIA-scoped (event_type LIKE
 * 'cia.%') to bound blast radius; a general platform relay is a later superset.
 */
const { Op } = require('sequelize');
const config = require('../config');
const logger = require('../shared/utils/logger');
const { routingKeyFor } = require('../modules/cattle_induction/constants/ciaNotifications');
const { ensureCiaTemplates } = require('../modules/cattle_induction/constants/ciaNotificationTemplates');
const { dispatchCiaNotification } = require('../modules/cattle_induction/services/ciaNotifyDispatchService');

let db;
const getDb = () => { if (!db) db = require('../shared/models'); return db; };

const runOutboxRelayJob = async ({ batchSize = 200, now = new Date() } = {}) => {
  const { DomainEvent } = getDb();
  const rows = await DomainEvent.findAll({
    where: { published_at: null, event_type: { [Op.like]: 'cia.%' } },
    order: [['id', 'ASC']],
    limit: batchSize,
  });
  if (!rows.length) return { relayed: 0, dispatched: 0 };

  await ensureCiaTemplates(); // once per run (idempotent findOrCreate)

  // Best-effort broker channel, fetched once (never blocks the relay; no consumer yet).
  let channel = null;
  try { const { getChannel } = require('../config/rabbitmq'); channel = await getChannel(); }
  catch (e) { logger.warn(`outboxRelayJob: no RabbitMQ channel (${e.message})`); channel = null; }

  let dispatched = 0;
  for (const row of rows) {
    // (a) decoupling publish — best-effort, must never block stamping.
    if (channel) {
      try {
        channel.publish(config.rabbitmq.exchange, routingKeyFor(row.event_type), Buffer.from(JSON.stringify({
          eventUuid: row.event_uuid, eventType: row.event_type, aggregateType: row.aggregate_type,
          aggregateId: row.aggregate_id, farmerId: row.farmer_id, payload: row.payload,
        })));
      } catch (e) { logger.warn(`outboxRelayJob: publish failed for ${row.event_type}: ${e.message}`); }
    }
    // (b) inline dispatch — the real delivery (in-app + best-effort SMS).
    try {
      // eslint-disable-next-line no-await-in-loop
      const r = await dispatchCiaNotification(row);
      if (r) dispatched += 1;
    } catch (e) { logger.error(`outboxRelayJob: dispatch failed for ${row.event_type}: ${e.message}`); }
    // (c) stamp — at-most-once, tied to the single permitted mutation.
    // eslint-disable-next-line no-await-in-loop
    await row.update({ published_at: now });
  }
  logger.info(`outboxRelayJob: relayed ${rows.length} cia events, ${dispatched} notification(s)`);
  return { relayed: rows.length, dispatched };
};

module.exports = { runOutboxRelayJob };
