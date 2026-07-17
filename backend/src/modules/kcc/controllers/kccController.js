/**
 * KCC controllers — HTTP only, no business logic (house pattern). Farmer-facing
 * surfaces (calculator, application, limit dashboard, LT drawdown, renewal pack)
 * plus the bank/ops-authored lifecycle transitions (roleCheck'd at the route).
 */
const { success, error } = require('../../../shared/utils/responseHelper');
const limitService = require('../services/kccLimitService');
const origination = require('../services/kccOriginationService');
const drawdownService = require('../services/kccDrawdownService');
const drawingPowerService = require('../services/kccDrawingPowerService');
const renewalPack = require('../services/renewalPackService');
const trustService = require('../../trust/services/trustService');

let db;
const getDb = () => { if (!db) db = require('../../../shared/models'); return db; };

/** Resolve the caller's internal User.id (facility.farmer_id references it). */
const resolveUserId = async (req) => {
  const { User } = getDb();
  const user = await User.findOne({ where: { user_id: req.user.id, is_active: true } });
  if (!user) { const e = new Error('User not found'); e.statusCode = 404; e.errorCode = 'USER_NOT_FOUND'; throw e; }
  return user.id;
};

const notFound = () => { const e = new Error('Facility not found'); e.statusCode = 404; e.errorCode = 'KCC_FACILITY_NOT_FOUND'; return e; };
const forbidden = () => { const e = new Error('You may not access this facility'); e.statusCode = 403; e.errorCode = 'KCC_FACILITY_FORBIDDEN'; return e; };

/** Load the URL's facility and assert the caller OWNS it (farmer-authored actions). */
const loadOwnedFacility = async (req) => {
  const { KccFacility } = getDb();
  const facility = await KccFacility.findOne({ where: { facility_uuid: req.params.facilityUuid } });
  if (!facility) throw notFound();
  const farmerId = await resolveUserId(req);
  if (facility.farmer_id !== farmerId) throw forbidden();
  return facility;
};

/** Load the URL's facility for READ: the owner OR a BANKER (the v1 banker interface). */
const loadReadableFacility = async (req) => {
  const { KccFacility } = getDb();
  const facility = await KccFacility.findOne({ where: { facility_uuid: req.params.facilityUuid } });
  if (!facility) throw notFound();
  if (req.user.role === 'BANKER') return facility;
  const farmerId = await resolveUserId(req);
  if (facility.farmer_id !== farmerId) throw forbidden();
  return facility;
};

/** Load a drawdown request and assert access via its parent facility. */
const loadAccessibleDrawdown = async (req, { allowBanker = false } = {}) => {
  const { KccDrawdownRequest, KccFacility } = getDb();
  const request = await KccDrawdownRequest.findOne({ where: { request_uuid: req.params.requestUuid } });
  if (!request) { const e = new Error('Drawdown request not found'); e.statusCode = 404; e.errorCode = 'KCC_DRAWDOWN_NOT_FOUND'; throw e; }
  const facility = await KccFacility.findByPk(request.facility_id);
  if (allowBanker && req.user.role === 'BANKER') return request;
  const farmerId = await resolveUserId(req);
  if (!facility || facility.farmer_id !== farmerId) throw forbidden();
  return request;
};

// ── Calculator (no persistence) ────────────────────────────────────
const calculate = async (req, res, next) => {
  try {
    const farmerId = await resolveUserId(req); // so units (and animal subsets) resolve LIVE from the caller's register
    const { activities, investmentItems, stateCode, schemeVersion } = req.body;
    const data = await limitService.calculate({ farmerId, stateCode, schemeVersion, activities, investmentItems });
    return success(res, { message: 'KCC limit computed', data });
  } catch (err) { next(err); }
};

// ── Eligibility + TRUST (co-op formality pillar) ───────────────────
const eligibility = async (req, res, next) => {
  try {
    const farmerId = await resolveUserId(req);
    const trust = await trustService.computeScore(farmerId);
    return success(res, { message: 'KCC eligibility & trust', data: {
      trust,
      collateralFreeCeiling: 200000, // ≤ ₹2 lakh collateral-free (¶23); config in scheme_configs
      note: 'Trust is decision support with reason codes — the sanctioned limit is always the engine’s statutory math.',
    } });
  } catch (err) { next(err); }
};

// ── Application / origination ──────────────────────────────────────
const apply = async (req, res, next) => {
  try {
    const farmerId = await resolveUserId(req);
    const { activities, investmentItems, stateCode, schemeVersion, bankAccountRef, tieupRequested, kyc, repaymentConsent } = req.body;
    const { facility, result } = await limitService.originateFacility({ farmerId, stateCode, schemeVersion, activities, investmentItems, bankAccountRef, tieupRequested, kyc, repaymentConsent });
    return success(res, { message: 'Facility drafted', data: { facilityUuid: facility.facility_uuid, status: facility.status, cmpl: Number(facility.cmpl), result }, statusCode: 201 });
  } catch (err) { next(err); }
};

/** Limit dashboard — the farmer's latest facility + its 6-year schedule. */
const getFacility = async (req, res, next) => {
  try {
    const farmerId = await resolveUserId(req);
    const { KccFacility, KccFacilityActivity, KccLimitSchedule } = getDb();
    const facility = await KccFacility.findOne({ where: { farmer_id: farmerId, is_active: true }, order: [['created_at', 'DESC']] });
    if (!facility) return success(res, { message: 'No KCC facility yet', data: { hasFacility: false } });
    const [activities, schedule] = await Promise.all([
      KccFacilityActivity.findAll({ where: { facility_id: facility.id } }),
      KccLimitSchedule.findAll({ where: { facility_id: facility.id }, order: [['year_index', 'ASC']] }),
    ]);
    return success(res, { message: 'KCC facility', data: {
      hasFacility: true, facilityUuid: facility.facility_uuid, status: facility.status,
      cmpl: Number(facility.cmpl), stSubLimit: Number(facility.st_sublimit), ltSubLimit: Number(facility.lt_sublimit),
      collateralFree: facility.collateral_free, collateralFreeLimitApplied: facility.collateral_free_limit_applied,
      tieupRequested: facility.tieup_requested, tieupCertified: facility.tieup_certified,
      bankAccountRef: facility.bank_account_ref, kyc: facility.kyc_ready, repaymentConsent: facility.repayment_consent,
      selectedAnimalUuids: facility.selected_animal_uuids,
      nextReviewAt: facility.next_review_at,
      activities, schedule,
    } });
  } catch (err) { next(err); }
};

// ── Lifecycle transitions ──────────────────────────────────────────
const submitApplication = async (req, res, next) => {
  try {
    await loadOwnedFacility(req);
    const f = await origination.submit(req.params.facilityUuid);
    return success(res, { message: 'Application submitted', data: { facilityUuid: f.facility_uuid, status: f.status } });
  } catch (err) { next(err); }
};

const renew = async (req, res, next) => {
  try {
    await loadOwnedFacility(req);
    const f = await origination.renew(req.params.facilityUuid);
    return success(res, { message: 'Facility renewed', data: { facilityUuid: f.facility_uuid, status: f.status, nextReviewAt: f.next_review_at } });
  } catch (err) { next(err); }
};

/** Bank/ops-authored transition (route roleCheck's the actor). */
const ROLE_TO_AUTHORITY = { BANKER: 'BANK', FARMER: 'FARMER' };
const transition = async (req, res, next) => {
  try {
    const { toStatus, reason } = req.body;
    const actorRole = ROLE_TO_AUTHORITY[req.user.role] || req.user.role;
    const f = await origination.transition(req.params.facilityUuid, toStatus, { actorRole, reason });
    return success(res, { message: `Facility → ${toStatus}`, data: { facilityUuid: f.facility_uuid, status: f.status } });
  } catch (err) { next(err); }
};

// ── LT drawdown ────────────────────────────────────────────────────
const createDrawdown = async (req, res, next) => {
  try {
    await loadOwnedFacility(req);
    const r = await drawdownService.create(req.params.facilityUuid, req.body);
    return success(res, { message: 'Drawdown drafted', data: { requestUuid: r.request_uuid, status: r.status, amount: Number(r.amount) }, statusCode: 201 });
  } catch (err) { next(err); }
};

const listDrawdowns = async (req, res, next) => {
  try {
    await loadReadableFacility(req);
    const data = await drawdownService.list(req.params.facilityUuid);
    return success(res, { message: 'Drawdowns', data });
  } catch (err) { next(err); }
};

const submitDrawdown = async (req, res, next) => {
  try { await loadAccessibleDrawdown(req); const r = await drawdownService.submit(req.params.requestUuid); return success(res, { message: 'Drawdown submitted', data: { requestUuid: r.request_uuid, status: r.status } }); }
  catch (err) { next(err); }
};
const bankApproveDrawdown = async (req, res, next) => {
  try { const r = await drawdownService.bankApprove(req.params.requestUuid); return success(res, { message: 'Drawdown approved', data: { requestUuid: r.request_uuid, status: r.status } }); }
  catch (err) { next(err); }
};
const disburseDrawdown = async (req, res, next) => {
  try {
    const { request, linkedAnimal } = await drawdownService.disburse(req.params.requestUuid);
    return success(res, { message: 'Drawdown disbursed', data: { requestUuid: request.request_uuid, status: request.status, linkedAnimalId: linkedAnimal ? linkedAnimal.id : null } });
  } catch (err) { next(err); }
};
const rejectDrawdown = async (req, res, next) => {
  try { await loadAccessibleDrawdown(req, { allowBanker: true }); const r = await drawdownService.reject(req.params.requestUuid, req.body.reason); return success(res, { message: 'Drawdown rejected', data: { requestUuid: r.request_uuid, status: r.status } }); }
  catch (err) { next(err); }
};

// ── Drawing power ──────────────────────────────────────────────────
const buildDrawingPower = async (req, res, next) => {
  try {
    await loadOwnedFacility(req);
    const snap = await drawingPowerService.buildSnapshot(req.params.facilityUuid, req.body);
    return success(res, { message: 'Drawing-power snapshot', data: { drawingPower: Number(snap.drawing_power), asOf: snap.snapshot_date }, statusCode: 201 });
  } catch (err) { next(err); }
};
const getDrawingPower = async (req, res, next) => {
  try {
    await loadReadableFacility(req);
    const snap = await drawingPowerService.latest(req.params.facilityUuid);
    if (!snap) return success(res, { message: 'No snapshot yet', data: null });
    return success(res, { message: 'Latest drawing power', data: { drawingPower: Number(snap.drawing_power), asOf: snap.snapshot_date, milkReceivables: Number(snap.milk_receivables) } });
  } catch (err) { next(err); }
};

// ── Renewal / application pack (banker interface) ──────────────────
const getPack = async (req, res, next) => {
  try { await loadReadableFacility(req); const pack = await renewalPack.buildPack(req.params.facilityUuid); return success(res, { message: pack.kind, data: pack }); }
  catch (err) { next(err); }
};
const getPackHtml = async (req, res, next) => {
  try { await loadReadableFacility(req); const { html } = await renewalPack.generate(req.params.facilityUuid); res.type('html').send(html); }
  catch (err) { next(err); }
};

module.exports = {
  calculate, eligibility, apply, getFacility, submitApplication, renew, transition,
  createDrawdown, listDrawdowns, submitDrawdown, bankApproveDrawdown, disburseDrawdown, rejectDrawdown,
  buildDrawingPower, getDrawingPower, getPack, getPackHtml,
};
