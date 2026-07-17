/**
 * COOP controllers — HTTP only, no business logic (house pattern).
 * Non-members get the join-society nudge (the acquisition funnel), never a 403.
 */
const { success, error } = require('../../../shared/utils/responseHelper');
const membershipService = require('../services/membershipService');
const passbookService = require('../services/passbookService');
const eligibilityService = require('../services/eligibilityService');
const orderService = require('../services/orderService');

let db;
const getDb = () => { if (!db) db = require('../../../shared/models'); return db; };

const JOIN_NUDGE = {
  isMember: false,
  nudge: {
    title: 'Join your village dairy society',
    body: 'Members get a milk passbook, input credit up to 70% of their milk dues, and a path to a KCC. Link your membership to begin.',
    cta: 'Find my society',
  },
};

/** Resolve the caller's co-op membership (or null for non-members). */
const resolveMember = async (req) => {
  const { User } = getDb();
  const user = await User.findOne({ where: { user_id: req.user.id, is_active: true } });
  if (!user) return { user: null, membership: null };
  const membership = await membershipService.getByUser(user.id);
  return { user, membership };
};

const getPassbook = async (req, res, next) => {
  try {
    const { membership } = await resolveMember(req);
    if (!membership) return success(res, { message: 'Not a linked member', data: JOIN_NUDGE });
    const data = await passbookService.getPassbook(membership.farmer_ref, membership.society_ref);
    return success(res, { message: 'Passbook', data: { isMember: true, ...data } });
  } catch (err) { next(err); }
};

const getEligibility = async (req, res, next) => {
  try {
    const { membership } = await resolveMember(req);
    if (!membership) return success(res, { message: 'Not a linked member', data: JOIN_NUDGE });
    const data = await eligibilityService.computeEligibility(membership.farmer_ref, membership.society_ref);
    return success(res, { message: 'Eligibility', data });
  } catch (err) { next(err); }
};

const getCatalog = async (req, res, next) => {
  try {
    return success(res, { message: 'Input catalog', data: await orderService.listCatalog() });
  } catch (err) { next(err); }
};

const createDraft = async (req, res, next) => {
  try {
    const { membership } = await resolveMember(req);
    if (!membership) return error(res, { message: 'Join a society to order inputs', errorCode: 'COOP_NOT_MEMBER', statusCode: 403 });
    const order = await orderService.createDraft({
      farmerRef: membership.farmer_ref, societyRef: membership.society_ref,
      membershipId: membership.id, lines: req.body.lines,
    });
    return success(res, { message: 'Draft created', data: { orderUuid: order.order_uuid, status: order.status, total: Number(order.total_amount) }, statusCode: 201 });
  } catch (err) { next(err); }
};

const submitOrder = async (req, res, next) => {
  try {
    const { membership } = await resolveMember(req);
    if (!membership) return error(res, { message: 'Join a society to order inputs', errorCode: 'COOP_NOT_MEMBER', statusCode: 403 });
    const order = await orderService.submitOrder(req.params.orderUuid, { ownerFarmerRef: membership.farmer_ref });
    return success(res, { message: 'Order submitted', data: { orderUuid: order.order_uuid, status: order.status } });
  } catch (err) { next(err); }
};

const confirmReceipt = async (req, res, next) => {
  try {
    const { membership } = await resolveMember(req);
    if (!membership) return error(res, { message: 'Join a society to order inputs', errorCode: 'COOP_NOT_MEMBER', statusCode: 403 });
    const order = await orderService.confirmReceipt(req.params.orderUuid, { ownerFarmerRef: membership.farmer_ref });
    return success(res, { message: 'Receipt confirmed', data: { orderUuid: order.order_uuid, status: order.status } });
  } catch (err) { next(err); }
};

const listOrders = async (req, res, next) => {
  try {
    const { membership } = await resolveMember(req);
    if (!membership) return success(res, { message: 'Not a linked member', data: JOIN_NUDGE });
    const rows = await orderService.listOrders(membership.farmer_ref);
    return success(res, { message: 'Orders', data: rows });
  } catch (err) { next(err); }
};

const linkMembership = async (req, res, next) => {
  try {
    const { User } = getDb();
    const user = await User.findOne({ where: { user_id: req.user.id, is_active: true } });
    if (!user) return error(res, { message: 'User not found', errorCode: 'USER_NOT_FOUND', statusCode: 404 });
    const membership = await membershipService.linkUser(user.id, req.body.farmerRef, { callerMobile: user.mobile });
    return success(res, { message: 'Membership linked', data: { farmerRef: membership.farmer_ref, society: membership.society_ref, linkStatus: membership.link_status } });
  } catch (err) { next(err); }
};

const joinNudge = async (req, res, next) => {
  try { return success(res, { message: 'Join society', data: JOIN_NUDGE }); } catch (err) { next(err); }
};

module.exports = {
  getPassbook, getEligibility, getCatalog, createDraft, submitOrder,
  confirmReceipt, listOrders, linkMembership, joinNudge,
};
