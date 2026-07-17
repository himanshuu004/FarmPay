/**
 * Domain-event emitter (AI-0a outbox).
 *
 * Call inside the SAME transaction as the state change so the event and the
 * write commit atomically (transactional outbox). A separate relay publishes
 * unpublished rows to RabbitMQ and stamps published_at.
 *
 *   await emitDomainEvent({
 *     eventType: 'coop.order.submitted',
 *     aggregateType: 'CoopInputOrder', aggregateId: order.order_uuid,
 *     farmerId, payload: { total: order.total_amount },
 *   }, { transaction: t });
 */
const crypto = require('crypto');

let db;
const getDb = () => { if (!db) db = require('../models'); return db; };

const emitDomainEvent = async (
  { eventType, aggregateType, aggregateId, farmerId = null, payload = {} },
  { transaction } = {}
) => {
  if (!eventType || !aggregateType || aggregateId === undefined || aggregateId === null) {
    const e = new Error('emitDomainEvent requires eventType, aggregateType, aggregateId');
    e.statusCode = 500; e.errorCode = 'DOMAIN_EVENT_INVALID';
    throw e;
  }
  return getDb().DomainEvent.create({
    event_uuid: crypto.randomUUID(),
    event_type: eventType,
    aggregate_type: aggregateType,
    aggregate_id: String(aggregateId),
    farmer_id: farmerId,
    payload,
    occurred_at: new Date(),
  }, { transaction });
};

module.exports = { emitDomainEvent };
