/**
 * CLAIMS controllers — three role-separated surfaces:
 *   /api/v1/claims        farmer (intimate, evidence, submit docs, read own)
 *   /api/v1/claims/field  SURVEYOR / VET (survey, post-mortem)
 *   /api/v1/admin/claims  INSURER_OPS (review, settle, reject) — human only
 * Ownership enforced for farmer resources; decisions are never automated.
 */
const { success } = require('../../../shared/utils/responseHelper');
const claimService = require('../services/claimService');
const evidenceService = require('../services/evidenceService');
const claimEvents = require('../services/claimEventService');
const surveyorTasks = require('../services/surveyorTaskService');
const vetHonorarium = require('../services/vetHonorariumService');

let db;
const getDb = () => { if (!db) db = require('../../../shared/models'); return db; };

const resolveUserId = async (req) => {
  const { User } = getDb();
  const user = await User.findOne({ where: { user_id: req.user.id, is_active: true } });
  if (!user) { const e = new Error('User not found'); e.statusCode = 404; e.errorCode = 'USER_NOT_FOUND'; throw e; }
  return user.id;
};

const loadOwnedClaim = async (req) => {
  const claim = await claimService.find(req.params.claimUuid);
  const farmerId = await resolveUserId(req);
  if (claim.farmer_id !== farmerId) { const e = new Error('Not your claim'); e.statusCode = 403; e.errorCode = 'CLAIMS_FORBIDDEN'; throw e; }
  return { claim, farmerId };
};

// ── Farmer ─────────────────────────────────────────────────────────
const intimate = async (req, res, next) => {
  try {
    const farmerId = await resolveUserId(req);
    const claim = await claimService.intimate({ farmerId, ...req.body });
    // Open the first field task (surveyor verifies the loss).
    await require('../services/surveyorTaskService').openInitialTask(claim.id);
    return success(res, { message: 'Claim intimated', data: { claimUuid: claim.claim_uuid, status: claim.status, sumClaimed: Number(claim.sum_claimed) }, statusCode: 201 });
  } catch (err) { next(err); }
};

const listMine = async (req, res, next) => {
  try {
    const farmerId = await resolveUserId(req);
    return success(res, { message: 'My claims', data: await claimService.listForFarmer(farmerId) });
  } catch (err) { next(err); }
};

const getClaim = async (req, res, next) => {
  try {
    if (!['INSURER_OPS', 'SURVEYOR', 'VET', 'GOV_VIEWER'].includes(req.user.role)) await loadOwnedClaim(req);
    return success(res, { message: 'Claim', data: await claimService.getDetail(req.params.claimUuid) });
  } catch (err) { next(err); }
};

const addEvidence = async (req, res, next) => {
  try {
    const { claim } = await loadOwnedClaim(req);
    const { file, duplicateContentHash } = await evidenceService.addEvidence(claim, req.body);
    const checklist = await evidenceService.checklist(claim.id);
    return success(res, { message: 'Evidence added', data: { evidenceUuid: file.evidence_uuid, duplicateContentHash, checklist }, statusCode: 201 });
  } catch (err) { next(err); }
};

const submitDocs = async (req, res, next) => {
  try {
    const { farmerId } = await loadOwnedClaim(req);
    const c = await claimService.submitDocs(req.params.claimUuid, { ownerFarmerId: farmerId });
    return success(res, { message: 'Documents submitted', data: { claimUuid: c.claim_uuid, status: c.status, deadlineAt: c.stage_deadline_at } });
  } catch (err) { next(err); }
};

const verifyChain = async (req, res, next) => {
  try {
    if (!['INSURER_OPS', 'GOV_VIEWER'].includes(req.user.role)) await loadOwnedClaim(req);
    const claim = await claimService.find(req.params.claimUuid);
    return success(res, { message: 'Chain integrity', data: await claimEvents.verifyChain(claim.id) });
  } catch (err) { next(err); }
};

// ── Field (SURVEYOR / VET) ─────────────────────────────────────────
const recordSurvey = async (req, res, next) => {
  try {
    const surveyorId = await resolveUserId(req).catch(() => null);
    const c = await claimService.recordSurvey(req.params.claimUuid, { surveyorId, report: req.body.report });
    return success(res, { message: 'Survey recorded', data: { claimUuid: c.claim_uuid, status: c.status } });
  } catch (err) { next(err); }
};

const recordPostmortem = async (req, res, next) => {
  try {
    const vetId = await resolveUserId(req).catch(() => null);
    const c = await claimService.recordPostmortem(req.params.claimUuid, { vetId, report: req.body.report });
    return success(res, { message: 'Post-mortem recorded', data: { claimUuid: c.claim_uuid, status: c.status } });
  } catch (err) { next(err); }
};

// ── Admin (INSURER_OPS) — human decisions only ─────────────────────
const beginReview = async (req, res, next) => {
  try { const c = await claimService.beginReview(req.params.claimUuid); return success(res, { message: 'Under review', data: { claimUuid: c.claim_uuid, status: c.status } }); }
  catch (err) { next(err); }
};

const settle = async (req, res, next) => {
  try {
    const actorId = await resolveUserId(req).catch(() => null);
    const c = await claimService.settle(req.params.claimUuid, { amount: req.body.amount, actorId });
    return success(res, { message: 'Claim settled', data: { claimUuid: c.claim_uuid, status: c.status, settledAmount: Number(c.settled_amount), penalInterest: Number(c.penal_interest_accrued) } });
  } catch (err) { next(err); }
};

const reject = async (req, res, next) => {
  try {
    const actorId = await resolveUserId(req).catch(() => null);
    const c = await claimService.reject(req.params.claimUuid, { reason: req.body.reason, actorId });
    return success(res, { message: 'Claim rejected', data: { claimUuid: c.claim_uuid, status: c.status } });
  } catch (err) { next(err); }
};

// ── Field task queue (SURVEYOR / VET) ──────────────────────────────
const myTasks = async (req, res, next) => {
  try {
    const assigneeId = await resolveUserId(req).catch(() => null);
    const tasks = await surveyorTasks.listForRole(req.user.role, { assigneeId: req.query.mine === '1' ? assigneeId : null });
    return success(res, { message: 'Field tasks', data: tasks });
  } catch (err) { next(err); }
};
const taskEnroute = async (req, res, next) => {
  try { const id = await resolveUserId(req).catch(() => null); const t = await surveyorTasks.advance(req.params.taskUuid, 'enroute', { assigneeId: id }); return success(res, { message: 'En route', data: { taskUuid: t.task_uuid, status: t.status } }); }
  catch (err) { next(err); }
};
const taskOnsite = async (req, res, next) => {
  try { const id = await resolveUserId(req).catch(() => null); const t = await surveyorTasks.advance(req.params.taskUuid, 'onsite', { assigneeId: id }); return success(res, { message: 'On site', data: { taskUuid: t.task_uuid, status: t.status } }); }
  catch (err) { next(err); }
};
const taskSubmit = async (req, res, next) => {
  try { const id = await resolveUserId(req).catch(() => null); const t = await surveyorTasks.submit(req.params.taskUuid, { assigneeId: id, assigneeRole: req.user.role, report: req.body.report }); return success(res, { message: 'Field report filed', data: { taskUuid: t.task_uuid, status: t.status } }); }
  catch (err) { next(err); }
};
const taskQc = async (req, res, next) => {
  try { const t = await surveyorTasks.qcPass(req.params.taskUuid); return success(res, { message: 'QC passed', data: { taskUuid: t.task_uuid, status: t.status } }); }
  catch (err) { next(err); }
};
const honorarium = async (req, res, next) => {
  try { const vetId = await resolveUserId(req); return success(res, { message: 'Honorarium ledger', data: await vetHonorarium.listForVet(vetId, { quarter: req.query.quarter }) }); }
  catch (err) { next(err); }
};

module.exports = {
  intimate, listMine, getClaim, addEvidence, submitDocs, verifyChain,
  recordSurvey, recordPostmortem, beginReview, settle, reject,
  myTasks, taskEnroute, taskOnsite, taskSubmit, taskQc, honorarium,
};
