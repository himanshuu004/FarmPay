/**
 * KCC LT (investment) drawdown — blueprint §5.4; ¶19(2). Draws against the
 * facility's long-term sub-limit for animals / sheds / equipment. Without this
 * the LT half of CMPL is display-only.
 *
 *   DRAFT → SUBMITTED → BANK_APPROVED → DISBURSED   (↘ REJECTED)
 *
 * On DISBURSED the asset–loan–policy triangle closes:
 *   • an ANIMAL purchase enters the livestock register (units are LIVE, #6), and
 *   • an insurance nudge fires (Pashu Suraksha) — best-effort.
 *
 * Guard: cumulative non-rejected drawdowns may never exceed the facility's
 * lt_sublimit (the sanctioned investment ceiling). Co-op credit is NEVER part of
 * this — that's the ST/receivables side (#15).
 */
const crypto = require('crypto');
const { Op } = require('sequelize');
const { round2 } = require('../../../shared/utils/moneyHelper');
const { emitDomainEvent } = require('../../../shared/services/domainEvents');

let db;
const getDb = () => { if (!db) db = require('../../../shared/models'); return db; };

const err = (msg, code, status = 400) => { const e = new Error(msg); e.statusCode = status; e.errorCode = code; return e; };

// A drawdown can only be raised once the facility is sanctioned (the LT ceiling exists).
const DRAWABLE_FACILITY_STATES = ['SANCTIONED', 'DISBURSED', 'ACTIVE'];
const LIVE_DRAWDOWN_STATES = ['DRAFT', 'SUBMITTED', 'BANK_APPROVED', 'DISBURSED']; // everything but REJECTED

const findFacility = async (facilityUuid, t = null) => {
  const { KccFacility } = getDb();
  const facility = await KccFacility.findOne({ where: { facility_uuid: facilityUuid }, transaction: t });
  if (!facility) throw err('Facility not found', 'KCC_FACILITY_NOT_FOUND', 404);
  return facility;
};

const findRequest = async (requestUuid, t = null) => {
  const { KccDrawdownRequest } = getDb();
  const req = await KccDrawdownRequest.findOne({ where: { request_uuid: requestUuid }, transaction: t });
  if (!req) throw err('Drawdown request not found', 'KCC_DRAWDOWN_NOT_FOUND', 404);
  return req;
};

/** Sum of committed (non-rejected) drawdowns on a facility. */
const committedTotal = async (facilityId, { excludeId = null, transaction = null } = {}) => {
  const { KccDrawdownRequest } = getDb();
  const where = { facility_id: facilityId, status: { [Op.in]: LIVE_DRAWDOWN_STATES } };
  if (excludeId) where.id = { [Op.ne]: excludeId };
  const total = await KccDrawdownRequest.sum('amount', { where, transaction });
  return round2(total || 0);
};

/** Available LT headroom = lt_sublimit − committed drawdowns. */
const headroom = async (facility, opts = {}) => {
  const ceiling = Number(facility.lt_sublimit || 0);
  const committed = await committedTotal(facility.id, opts);
  return { ceiling, committed, available: round2(Math.max(0, ceiling - committed)) };
};

/** Create a DRAFT drawdown, guarded against the LT ceiling. */
const create = async (facilityUuid, { item, description, amount, quotationDocUrl = null, sellerRef = null }) => {
  const { KccDrawdownRequest, KccDrawdownRequest: Model } = getDb();
  if (!Model.ITEM_TYPES.includes(item)) throw err(`Invalid item ${item}`, 'KCC_DRAWDOWN_ITEM_INVALID');
  if (!(amount > 0)) throw err('Amount must be positive', 'KCC_DRAWDOWN_AMOUNT_INVALID');

  const facility = await findFacility(facilityUuid);
  if (!DRAWABLE_FACILITY_STATES.includes(facility.status)) {
    throw err(`Cannot raise a drawdown while facility is ${facility.status}`, 'KCC_FACILITY_NOT_DRAWABLE');
  }
  const room = await headroom(facility);
  if (round2(amount) > room.available) {
    throw err(`Amount ₹${round2(amount)} exceeds LT headroom ₹${room.available} (ceiling ₹${room.ceiling})`, 'KCC_LT_LIMIT_EXCEEDED');
  }

  const request = await KccDrawdownRequest.create({
    request_uuid: crypto.randomUUID(), facility_id: facility.id,
    item, description, amount: round2(amount),
    quotation_doc_url: quotationDocUrl, seller_ref: sellerRef, status: 'DRAFT',
  });
  await emitDomainEvent({
    eventType: 'kcc.drawdown.created', aggregateType: 'KccDrawdownRequest', aggregateId: request.request_uuid,
    farmerId: facility.farmer_id, payload: { item, amount: Number(request.amount), facilityUuid },
  });
  return request;
};

// ── Simple guarded transitions ─────────────────────────────────────
const LEGAL = {
  DRAFT: { SUBMITTED: 'FARMER', REJECTED: 'FARMER' },
  SUBMITTED: { BANK_APPROVED: 'BANK', REJECTED: 'BANK' },
  BANK_APPROVED: { DISBURSED: 'BANK', REJECTED: 'BANK' },
  DISBURSED: {},
  REJECTED: {},
};

const step = async (requestUuid, toStatus, { actorRole = null, reason = null } = {}) => {
  const request = await findRequest(requestUuid);
  const authority = (LEGAL[request.status] || {})[toStatus];
  if (!authority) throw err(`Illegal drawdown transition ${request.status} → ${toStatus}`, 'KCC_DRAWDOWN_ILLEGAL_TRANSITION');
  if (actorRole && actorRole !== authority) {
    throw err(`${actorRole} may not author ${request.status} → ${toStatus}`, 'KCC_DRAWDOWN_FORBIDDEN', 403);
  }
  const patch = { status: toStatus };
  if (toStatus === 'REJECTED') patch.rejection_reason = reason;
  await request.update(patch);
  const facility = await request.getFacility();
  await emitDomainEvent({
    eventType: `kcc.drawdown.${toStatus.toLowerCase()}`, aggregateType: 'KccDrawdownRequest',
    aggregateId: request.request_uuid, farmerId: facility ? facility.farmer_id : null,
    payload: { to: toStatus, reason },
  });
  return request;
};

const submit = (requestUuid) => step(requestUuid, 'SUBMITTED', { actorRole: 'FARMER' });
const bankApprove = (requestUuid) => step(requestUuid, 'BANK_APPROVED', { actorRole: 'BANK' });
const reject = (requestUuid, reason = null) => {
  // Reject may be authored by FARMER (own draft) or BANK (under review) — resolve by state.
  return findRequest(requestUuid).then((r) => {
    const role = r.status === 'DRAFT' ? 'FARMER' : 'BANK';
    return step(requestUuid, 'REJECTED', { actorRole: role, reason });
  });
};

/**
 * BANK_APPROVED → DISBURSED. The terminal, side-effecting transition:
 *  1. re-check the LT ceiling (headroom may have moved),
 *  2. for an ANIMAL, insert the purchased animal into the register (units live),
 *  3. emit the disbursement event + an insurance nudge (best-effort).
 * All within one transaction (asset + loan link commit atomically).
 */
const disburse = async (requestUuid) => {
  const database = getDb();
  const { KccDrawdownRequest, KccFacility, DairyAnimal } = database;
  return database.sequelize.transaction(async (t) => {
    const request = await KccDrawdownRequest.findOne({ where: { request_uuid: requestUuid }, transaction: t });
    if (!request) throw err('Drawdown request not found', 'KCC_DRAWDOWN_NOT_FOUND', 404);
    if (request.status !== 'BANK_APPROVED') throw err(`Cannot disburse from ${request.status}`, 'KCC_DRAWDOWN_BAD_STATE');

    const facility = await KccFacility.findByPk(request.facility_id, { transaction: t });
    // Re-assert the ceiling excluding this request's own (already-committed) amount would double count,
    // so include it: committed already contains this BANK_APPROVED row — just ensure ceiling not breached.
    const room = await headroom(facility, { transaction: t });
    if (round2(room.committed) > room.ceiling) {
      throw err('LT ceiling breached — cannot disburse', 'KCC_LT_LIMIT_EXCEEDED');
    }

    const patch = { status: 'DISBURSED', disbursed_at: new Date() };

    // Asset → register (ANIMAL only; SHED/EQUIPMENT are not herd rows).
    let linkedAnimal = null;
    if (request.item === 'ANIMAL' && DairyAnimal) {
      linkedAnimal = await DairyAnimal.create({
        animal_uuid: crypto.randomUUID(),
        farmer_id: facility.farmer_id,
        acquisition_mode: 'PURCHASED',
        purchase_cost: request.amount,
        purchase_date: new Date().toISOString().slice(0, 10),
        purchase_source: request.seller_ref || 'KCC LT drawdown',
        status: 'ACTIVE', is_active: true,
        notes: `Financed via KCC LT drawdown ${request.request_uuid}`,
      }, { transaction: t });
      patch.linked_animal_id = linkedAnimal.id;
    }

    await request.update(patch, { transaction: t });

    await emitDomainEvent({
      eventType: 'kcc.drawdown.disbursed', aggregateType: 'KccDrawdownRequest', aggregateId: request.request_uuid,
      farmerId: facility.farmer_id,
      payload: { item: request.item, amount: Number(request.amount), linkedAnimalId: patch.linked_animal_id || null },
    }, { transaction: t });

    // Insurance nudge — the third leg of the triangle. An ANIMAL purchase should
    // be insured (NLM Pashu Suraksha); emit an event the nudge/notification layer
    // consumes. Never blocks disbursement.
    if (request.item === 'ANIMAL') {
      await emitDomainEvent({
        eventType: 'kcc.drawdown.insurance_nudge', aggregateType: 'KccDrawdownRequest', aggregateId: request.request_uuid,
        farmerId: facility.farmer_id,
        payload: { reason: 'newly-financed animal should be insured', linkedAnimalId: patch.linked_animal_id || null },
      }, { transaction: t });
    }

    return { request, linkedAnimal };
  });
};

const list = async (facilityUuid) => {
  const { KccDrawdownRequest } = getDb();
  const facility = await findFacility(facilityUuid);
  const rows = await KccDrawdownRequest.findAll({ where: { facility_id: facility.id }, order: [['created_at', 'DESC']] });
  const room = await headroom(facility);
  return { headroom: room, requests: rows };
};

module.exports = {
  LEGAL, DRAWABLE_FACILITY_STATES,
  create, submit, bankApprove, disburse, reject, list,
  headroom, committedTotal,
};
