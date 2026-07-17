/**
 * KAVACH controllers — HTTP only. Farmer surfaces (quote, assets, proposals,
 * policies) plus the VET/INSURER_OPS lifecycle actions (roleCheck'd at the route).
 * Ownership is enforced for farmer-authored/owned resources (audit lesson).
 */
const { success } = require('../../../shared/utils/responseHelper');
const quoteService = require('../services/kavachQuoteService');
const proposalService = require('../services/proposalService');
const policyService = require('../services/policyService');
const renewalService = require('../services/renewalService');
const commissionService = require('../services/commissionService');

let db;
const getDb = () => { if (!db) db = require('../../../shared/models'); return db; };

const resolveUserId = async (req) => {
  const { User } = getDb();
  const user = await User.findOne({ where: { user_id: req.user.id, is_active: true } });
  if (!user) { const e = new Error('User not found'); e.statusCode = 404; e.errorCode = 'USER_NOT_FOUND'; throw e; }
  return user.id;
};

// JWT role → service authority.
const AUTHORITY = { FARMER: 'FARMER', VET: 'VET', INSURER_OPS: 'OPS' };
const actorRoleOf = (req) => AUTHORITY[req.user.role] || req.user.role;

/** Load a proposal the caller OWNS (farmer-authored actions). */
const loadOwnedProposal = async (req) => {
  const proposal = await proposalService.find(req.params.proposalUuid);
  const farmerId = await resolveUserId(req);
  if (proposal.farmer_id !== farmerId) { const e = new Error('Not your proposal'); e.statusCode = 403; e.errorCode = 'KAVACH_PROPOSAL_FORBIDDEN'; throw e; }
  return proposal;
};

// ── Catalog + quote ────────────────────────────────────────────────
const listPlans = async (req, res, next) => {
  try {
    const { InsurancePlan } = getDb();
    const plans = await InsurancePlan.findAll({ where: { is_active: true }, order: [['species', 'ASC'], ['term_months', 'ASC']] });
    return success(res, { message: 'Plans', data: plans });
  } catch (err) { next(err); }
};

const quote = async (req, res, next) => {
  try {
    const farmerId = await resolveUserId(req).catch(() => null);
    const data = await quoteService.quote({ farmerId, ...req.body });
    return success(res, { message: 'Premium quote', data });
  } catch (err) { next(err); }
};

// ── Assets + protection ────────────────────────────────────────────
const assetsMe = async (req, res, next) => {
  try {
    const farmerId = await resolveUserId(req);
    return success(res, { message: 'Insurable assets', data: await policyService.assetsWithCoverage(farmerId) });
  } catch (err) { next(err); }
};

const policiesMe = async (req, res, next) => {
  try {
    const farmerId = await resolveUserId(req);
    const [snapshot, policies] = await Promise.all([
      policyService.protectionSnapshot(farmerId),
      policyService.listForFarmer(farmerId),
    ]);
    return success(res, { message: 'Protection', data: { snapshot, policies } });
  } catch (err) { next(err); }
};

const getPolicy = async (req, res, next) => {
  try {
    const farmerId = await resolveUserId(req);
    await policyService.findOwned(req.params.policyUuid, req.user.role === 'INSURER_OPS' ? null : farmerId);
    return success(res, { message: 'Policy', data: await policyService.getDetail(req.params.policyUuid) });
  } catch (err) { next(err); }
};

// ── Proposals: farmer-authored ─────────────────────────────────────
const createProposal = async (req, res, next) => {
  try {
    const farmerId = await resolveUserId(req);
    const proposal = await proposalService.createProposal({ farmerId, ...req.body });
    return success(res, { message: 'Proposal drafted', data: { proposalUuid: proposal.proposal_uuid, status: proposal.status, sumInsured: Number(proposal.sum_insured), premiumFarmer: Number(proposal.premium_farmer) }, statusCode: 201 });
  } catch (err) { next(err); }
};

const listProposals = async (req, res, next) => {
  try {
    const farmerId = await resolveUserId(req);
    return success(res, { message: 'Proposals', data: await proposalService.listForFarmer(farmerId) });
  } catch (err) { next(err); }
};

const getProposal = async (req, res, next) => {
  try {
    const proposal = await proposalService.find(req.params.proposalUuid);
    if (!['VET', 'INSURER_OPS'].includes(req.user.role)) {
      const farmerId = await resolveUserId(req);
      if (proposal.farmer_id !== farmerId) { const e = new Error('Not your proposal'); e.statusCode = 403; e.errorCode = 'KAVACH_PROPOSAL_FORBIDDEN'; throw e; }
    }
    return success(res, { message: 'Proposal', data: proposal });
  } catch (err) { next(err); }
};

const tag = async (req, res, next) => {
  try {
    await loadOwnedProposal(req);
    const p = await proposalService.tag(req.params.proposalUuid, req.body, { actorRole: 'FARMER' });
    return success(res, { message: 'Tagged', data: { proposalUuid: p.proposal_uuid, status: p.status } });
  } catch (err) { next(err); }
};

// ── Proposals: VET / OPS lifecycle (roleCheck'd at route) ──────────
const examine = async (req, res, next) => {
  try {
    const farmerId = await resolveUserId(req).catch(() => null);
    const p = await proposalService.examine(req.params.proposalUuid, { vetUserId: farmerId }, { actorRole: actorRoleOf(req) });
    return success(res, { message: 'Examined', data: { proposalUuid: p.proposal_uuid, status: p.status } });
  } catch (err) { next(err); }
};

const value = async (req, res, next) => {
  try {
    const p = await proposalService.value(req.params.proposalUuid, req.body, { actorRole: actorRoleOf(req) });
    return success(res, { message: 'Valued', data: { proposalUuid: p.proposal_uuid, status: p.status, sumInsured: Number(p.sum_insured) } });
  } catch (err) { next(err); }
};

const pay = async (req, res, next) => {
  try {
    const p = await proposalService.confirmPayment(req.params.proposalUuid, req.body, { actorRole: actorRoleOf(req) });
    return success(res, { message: 'Premium confirmed', data: { proposalUuid: p.proposal_uuid, status: p.status } });
  } catch (err) { next(err); }
};

const issue = async (req, res, next) => {
  try {
    const { policy } = await proposalService.issue(req.params.proposalUuid, req.body, { actorRole: actorRoleOf(req) });
    return success(res, { message: 'Policy issued', data: { policyUuid: policy.policy_uuid, status: policy.status, waitingUntil: policy.waiting_until }, statusCode: 201 });
  } catch (err) { next(err); }
};

const reject = async (req, res, next) => {
  try {
    const p = await proposalService.reject(req.params.proposalUuid, req.body.reason, { actorRole: actorRoleOf(req) });
    return success(res, { message: 'Rejected', data: { proposalUuid: p.proposal_uuid, status: p.status } });
  } catch (err) { next(err); }
};

// ── Renewals (farmer-owned) ────────────────────────────────────────
const renewalsDue = async (req, res, next) => {
  try {
    const farmerId = await resolveUserId(req);
    return success(res, { message: 'Renewals due', data: await renewalService.listDueForFarmer(farmerId) });
  } catch (err) { next(err); }
};

const renew = async (req, res, next) => {
  try {
    const farmerId = await resolveUserId(req);
    const { newPolicy } = await renewalService.renew(req.params.policyUuid, { ownerFarmerId: farmerId, actorRole: 'FARMER' });
    return success(res, { message: 'Renewed', data: { policyUuid: newPolicy.policy_uuid, status: newPolicy.status, startDate: newPolicy.start_date, endDate: newPolicy.end_date }, statusCode: 201 });
  } catch (err) { next(err); }
};

const optInRenewal = async (req, res, next) => {
  try {
    const farmerId = await resolveUserId(req);
    const j = await renewalService.optIn(req.params.journeyUuid, farmerId);
    return success(res, { message: 'Auto-renew opted in', data: { journeyUuid: j.journey_uuid, autoRenew: j.auto_renew_opt_in } });
  } catch (err) { next(err); }
};

const optOutRenewal = async (req, res, next) => {
  try {
    const farmerId = await resolveUserId(req);
    const j = await renewalService.optOut(req.params.journeyUuid, farmerId);
    return success(res, { message: 'Opted out', data: { journeyUuid: j.journey_uuid, status: j.status } });
  } catch (err) { next(err); }
};

// ── POSP commission escrow ─────────────────────────────────────────
const myCommissions = async (req, res, next) => {
  try { const pospId = await resolveUserId(req); return success(res, { message: 'Commissions', data: await commissionService.listForPosp(pospId) }); }
  catch (err) { next(err); }
};
const advanceCommission = async (req, res, next) => {
  try {
    const c = await commissionService.advance(req.params.commissionUuid, req.body.toState, { reason: req.body.reason });
    return success(res, { message: `Commission → ${c.state}`, data: { commissionUuid: c.commission_uuid, state: c.state, payoutDueDate: c.payout_due_date } });
  } catch (err) { next(err); }
};

module.exports = {
  listPlans, quote, assetsMe, policiesMe, getPolicy,
  createProposal, listProposals, getProposal, tag, examine, value, pay, issue, reject,
  renewalsDue, renew, optInRenewal, optOutRenewal,
  myCommissions, advanceCommission,
};
