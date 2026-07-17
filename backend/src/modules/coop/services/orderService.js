/**
 * Co-op input order lifecycle (blueprint §7 state machine).
 *
 *   DRAFT → SUBMITTED★ → SECRETARY_APPROVED → SUPERVISOR_APPROVED
 *         → DUSS_PROCESSING → DISPATCHED → RECEIPT_CONFIRMED★   (↘ REJECTED)
 *
 * ★ = the ONLY two transitions the app authors (createDraft→submit, and
 * confirmReceipt). Every approval status is ERP-authored and arrives via
 * applyErpStatus() (called by erpSyncService). The app NEVER approves
 * (CLAUDE.md #14). Co-op credit is never part of the KCC limit (#15).
 *
 * On RECEIPT_CONFIRMED the delivered inputs auto-log as a dairy FEED cost event
 * — single entry, both systems (#16).
 */
const crypto = require('crypto');
const { round2 } = require('../../../shared/utils/moneyHelper');
const { emitDomainEvent } = require('../../../shared/services/domainEvents');
const { getPolicy, demandWindowStatus } = require('./coopPolicyService');
const { canSubmit } = require('./eligibilityService');
const passbook = require('./passbookService');

let db;
const getDb = () => { if (!db) db = require('../../../shared/models'); return db; };

// Legal transitions. app = app-authored; erp = ERP-mirror authored.
const TRANSITIONS = {
  DRAFT: { SUBMITTED: 'app', REJECTED: 'erp' },
  SUBMITTED: { SECRETARY_APPROVED: 'erp', REJECTED: 'erp' },
  SECRETARY_APPROVED: { SUPERVISOR_APPROVED: 'erp', REJECTED: 'erp' },
  SUPERVISOR_APPROVED: { DUSS_PROCESSING: 'erp', REJECTED: 'erp' },
  DUSS_PROCESSING: { DISPATCHED: 'erp', REJECTED: 'erp' },
  DISPATCHED: { RECEIPT_CONFIRMED: 'app' },
  RECEIPT_CONFIRMED: {},
  REJECTED: {},
};
const ERP_STATUSES = ['SECRETARY_APPROVED', 'SUPERVISOR_APPROVED', 'DUSS_PROCESSING', 'DISPATCHED', 'REJECTED'];

const err = (msg, code, status = 400) => { const e = new Error(msg); e.statusCode = status; e.errorCode = code; return e; };

const listCatalog = async () => {
  const { CoopInputItem } = getDb();
  const items = await CoopInputItem.findAll({ where: { is_active: true }, order: [['category', 'ASC'], ['name', 'ASC']] });
  return items.map((i) => ({
    itemUuid: i.item_uuid, sku: i.sku, name: i.name, category: i.category,
    unit: i.unit, mrp: Number(i.mrp), subsidisedPrice: Number(i.subsidised_price),
  }));
};

/** Build order lines from {sku, quantity}[] against the live catalog. */
const buildLines = async (lines) => {
  const { CoopInputItem } = getDb();
  const items = await CoopInputItem.findAll({ where: { sku: lines.map((l) => l.sku), is_active: true } });
  const bySku = Object.fromEntries(items.map((i) => [i.sku, i]));
  const built = lines.map((l) => {
    const item = bySku[l.sku];
    if (!item) throw err(`Unknown item ${l.sku}`, 'COOP_ITEM_UNKNOWN', 404);
    if (!(l.quantity > 0)) throw err(`Invalid quantity for ${l.sku}`, 'COOP_QTY_INVALID');
    const unitPrice = Number(item.subsidised_price);
    return { item, sku: item.sku, name: item.name, quantity: l.quantity, unit_price: unitPrice, line_total: round2(unitPrice * l.quantity) };
  });
  const total = round2(built.reduce((s, x) => s + x.line_total, 0));
  return { built, total };
};

/** Create a DRAFT order (no signal / no window needed). */
const createDraft = async ({ farmerRef, societyRef = null, membershipId = null, lines }) => {
  const { CoopInputOrder, CoopInputOrderItem, sequelize } = getDb();
  const { built, total } = await buildLines(lines);
  return sequelize.transaction(async (t) => {
    const order = await CoopInputOrder.create({
      order_uuid: crypto.randomUUID(), membership_id: membershipId,
      farmer_ref: farmerRef, society_ref: societyRef, total_amount: total, status: 'DRAFT',
    }, { transaction: t });
    for (const b of built) {
      await CoopInputOrderItem.create({
        order_id: order.id, item_id: b.item.id, sku: b.sku, name: b.name,
        quantity: b.quantity, unit_price: b.unit_price, line_total: b.line_total,
      }, { transaction: t });
    }
    return order;
  });
};

/** ★ App-authored: submit a DRAFT. Gated on demand window + 70% limit.
 *  ownerFarmerRef (from the caller's membership) MUST match the order — the app
 *  only lets a member act on their OWN orders (no cross-member submission). */
const submitOrder = async (orderUuid, { ownerFarmerRef = null } = {}) => {
  const { CoopInputOrder } = getDb();
  const order = await CoopInputOrder.findOne({ where: { order_uuid: orderUuid } });
  if (!order) throw err('Order not found', 'COOP_ORDER_NOT_FOUND', 404);
  if (ownerFarmerRef && order.farmer_ref !== ownerFarmerRef) throw err('Not your order', 'COOP_ORDER_FORBIDDEN', 403);
  if (order.status !== 'DRAFT') throw err(`Cannot submit from ${order.status}`, 'COOP_ORDER_BAD_STATE');

  const policy = await getPolicy(order.society_ref || 'DEFAULT');
  const window = demandWindowStatus(policy);
  if (!window.open) {
    throw err('Ordering is closed — demand windows are the 1st and 3rd week of the month', 'COOP_WINDOW_CLOSED');
  }

  const decision = await canSubmit(order.farmer_ref, Number(order.total_amount), order.society_ref || 'DEFAULT');
  if (!decision.ok) throw err(decision.reason, 'COOP_LIMIT_EXCEEDED');

  await order.update({
    status: 'SUBMITTED',
    submitted_at: new Date(),
    demand_window: window.window.label,
    limit_snapshot: decision.snapshot.availableLimit,
    outstanding_at_submit: decision.snapshot.outstandingPayables,
  });
  await emitDomainEvent({
    eventType: 'coop.order.submitted', aggregateType: 'CoopInputOrder', aggregateId: order.order_uuid,
    payload: { farmerRef: order.farmer_ref, total: Number(order.total_amount), window: window.window.label },
  });
  await passbook.invalidate(order.farmer_ref); // in-flight changed → limit moves
  return order;
};

/** ★ App-authored: confirm receipt of a DISPATCHED order → auto-log feed cost.
 *  ownerFarmerRef guards against confirming another member's order. */
const confirmReceipt = async (orderUuid, { ownerFarmerRef = null } = {}) => {
  const { CoopInputOrder, sequelize } = getDb();
  const order = await CoopInputOrder.findOne({ where: { order_uuid: orderUuid } });
  if (!order) throw err('Order not found', 'COOP_ORDER_NOT_FOUND', 404);
  if (ownerFarmerRef && order.farmer_ref !== ownerFarmerRef) throw err('Not your order', 'COOP_ORDER_FORBIDDEN', 403);
  if (order.status !== 'DISPATCHED') throw err(`Cannot confirm receipt from ${order.status}`, 'COOP_ORDER_BAD_STATE');

  await sequelize.transaction(async (t) => {
    await order.update({ status: 'RECEIPT_CONFIRMED', receipt_confirmed_at: new Date() }, { transaction: t });
    await autoLogFeedCost(order, t);
    await emitDomainEvent({
      eventType: 'coop.order.receipt_confirmed', aggregateType: 'CoopInputOrder', aggregateId: order.order_uuid,
      payload: { farmerRef: order.farmer_ref, total: Number(order.total_amount) },
    }, { transaction: t });
  });
  await passbook.invalidate(order.farmer_ref);
  return order;
};

/** Delivered inputs auto-log as a dairy FEED cost event (single entry, both systems). */
const autoLogFeedCost = async (order, t) => {
  const { CoopMembership, DairyCostEvent } = getDb();
  const membership = order.membership_id
    ? await CoopMembership.findByPk(order.membership_id, { transaction: t })
    : await CoopMembership.findOne({ where: { farmer_ref: order.farmer_ref }, transaction: t });
  if (!membership || !membership.user_id) return; // non-linked member → nothing to log into dairy P&L
  await DairyCostEvent.create({
    event_uuid: crypto.randomUUID(),
    farmer_id: membership.user_id,
    event_date: new Date().toISOString().slice(0, 10),
    category: 'FEED',
    amount: Number(order.total_amount),
    notes: `Co-op input order ${order.order_uuid} (auto-logged on receipt)`,
  }, { transaction: t }).catch(() => { /* notes column optional; ignore if absent */ });
};

/**
 * ERP-authored status mirror. Called by erpSyncService when an ORDER_STATUS /
 * DISPATCH batch lands. Rejects any attempt to set an app-authored status.
 */
const applyErpStatus = async ({ orderUuid = null, erpOrderRef = null, newStatus, reason = null }) => {
  const { CoopInputOrder } = getDb();
  if (!ERP_STATUSES.includes(newStatus)) {
    throw err(`${newStatus} is not an ERP-authored status`, 'COOP_STATUS_NOT_ERP');
  }
  const where = orderUuid ? { order_uuid: orderUuid } : { erp_order_ref: erpOrderRef };
  const order = await CoopInputOrder.findOne({ where });
  if (!order) throw err('Order not found for ERP status update', 'COOP_ORDER_NOT_FOUND', 404);

  const allowed = TRANSITIONS[order.status] || {};
  if (allowed[newStatus] !== 'erp') {
    throw err(`Illegal ERP transition ${order.status} → ${newStatus}`, 'COOP_ILLEGAL_TRANSITION');
  }

  const patch = { status: newStatus };
  if (newStatus === 'REJECTED') patch.rejection_reason = reason;
  if (newStatus === 'DISPATCHED') patch.dispatched_at = new Date();
  await order.update(patch);

  await emitDomainEvent({
    eventType: `coop.order.${newStatus.toLowerCase()}`, aggregateType: 'CoopInputOrder',
    aggregateId: order.order_uuid, payload: { via: 'erp_sync', reason },
  });

  if (newStatus === 'DISPATCHED') await sendDispatchAlert(order);
  if (['REJECTED', 'DISPATCHED'].includes(newStatus)) await passbook.invalidate(order.farmer_ref);
  return order;
};

const sendDispatchAlert = async (order) => {
  try {
    const notifier = require('../../../shared/services/notificationService');
    if (notifier && typeof notifier.sendNotification === 'function') {
      await notifier.sendNotification({
        farmerRef: order.farmer_ref,
        type: 'coop_dispatch',
        title: 'Your co-op input order is on the way',
        body: `Order ${order.order_uuid} has been dispatched. Confirm receipt when it arrives.`,
      });
    }
  } catch { /* alerts are best-effort */ }
};

const listOrders = async (farmerRef) => {
  const { CoopInputOrder, CoopInputOrderItem } = getDb();
  const orders = await CoopInputOrder.findAll({
    where: { farmer_ref: farmerRef },
    include: [{ model: CoopInputOrderItem, as: 'items' }],
    order: [['created_at', 'DESC']],
  });
  return orders;
};

module.exports = {
  listCatalog, createDraft, submitOrder, confirmReceipt, applyErpStatus, listOrders,
  TRANSITIONS, ERP_STATUSES,
};
