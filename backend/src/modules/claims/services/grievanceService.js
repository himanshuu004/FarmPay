/**
 * Grievance tickets (§5.2; OG 30.6.5) — a 15-day disposal clock.
 *   open → ack → in_progress → resolved | escalated
 * grievanceAgeingJob escalates tickets that breach the disposal window.
 */
const crypto = require('crypto');
const { Op } = require('sequelize');
const { emitDomainEvent } = require('../../../shared/services/domainEvents');

let db;
const getDb = () => { if (!db) db = require('../../../shared/models'); return db; };

const err = (msg, code, status = 400) => { const e = new Error(msg); e.statusCode = status; e.errorCode = code; return e; };

const DISPOSAL_DAYS = 15;
const TRANSITIONS = { open: ['ack', 'escalated'], ack: ['in_progress', 'escalated'], in_progress: ['resolved', 'escalated'], escalated: ['resolved'], resolved: [] };

const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

const file = async ({ farmerId, category, priority = 'med', channel = 'app', policyId = null, claimId = null, description = null, routedTo = null }) => {
  const { GrievanceTicket } = getDb();
  const now = new Date();
  const ticket = await GrievanceTicket.create({
    ticket_uuid: crypto.randomUUID(), farmer_id: farmerId, category, priority, channel_filed: channel,
    policy_id: policyId, claim_id: claimId, description, routed_to: routedTo, status: 'open',
    filed_at: now, disposal_due_at: addDays(now, DISPOSAL_DAYS),
  });
  await emitDomainEvent({ eventType: 'grievance.filed', aggregateType: 'GrievanceTicket', aggregateId: ticket.ticket_uuid, farmerId, payload: { category, priority } });
  return ticket;
};

const transition = async (ticketUuid, toStatus, { note = null } = {}) => {
  const { GrievanceTicket } = getDb();
  const t = await GrievanceTicket.findOne({ where: { ticket_uuid: ticketUuid } });
  if (!t) throw err('Ticket not found', 'GRIEVANCE_NOT_FOUND', 404);
  if (!(TRANSITIONS[t.status] || []).includes(toStatus)) throw err(`Illegal transition ${t.status} → ${toStatus}`, 'GRIEVANCE_ILLEGAL');
  const patch = { status: toStatus };
  if (toStatus === 'resolved') { patch.resolved_at = new Date(); patch.resolution_note = note; }
  await t.update(patch);
  await emitDomainEvent({ eventType: `grievance.${toStatus}`, aggregateType: 'GrievanceTicket', aggregateId: t.ticket_uuid, farmerId: t.farmer_id, payload: { note } });
  return t;
};

const listForFarmer = async (farmerId) => {
  const { GrievanceTicket } = getDb();
  return GrievanceTicket.findAll({ where: { farmer_id: farmerId }, order: [['filed_at', 'DESC']] });
};

/** Escalate open/ack/in_progress tickets past their disposal deadline. */
const ageAndEscalate = async (asOf = new Date()) => {
  const { GrievanceTicket } = getDb();
  const overdue = await GrievanceTicket.findAll({ where: { status: { [Op.in]: ['open', 'ack', 'in_progress'] }, disposal_due_at: { [Op.lt]: asOf } } });
  for (const t of overdue) {
    await t.update({ status: 'escalated' });
    await emitDomainEvent({ eventType: 'grievance.escalated', aggregateType: 'GrievanceTicket', aggregateId: t.ticket_uuid, farmerId: t.farmer_id, payload: { reason: 'disposal_sla_breach' } });
  }
  return { escalated: overdue.length };
};

module.exports = { file, transition, listForFarmer, ageAndEscalate, DISPOSAL_DAYS };
