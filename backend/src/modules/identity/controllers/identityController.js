/**
 * Identity controllers — muzzle enrolment/erasure (farmer), claim match
 * (SURVEYOR/VET, advisory), and the shadow-mode review queue (SURVEYOR).
 */
const { success } = require('../../../shared/utils/responseHelper');
const biometricService = require('../services/biometricService');
const claimService = require('../../claims/services/claimService');

let db;
const getDb = () => { if (!db) db = require('../../../shared/models'); return db; };

const resolveUserId = async (req) => {
  const { User } = getDb();
  const user = await User.findOne({ where: { user_id: req.user.id, is_active: true } });
  if (!user) { const e = new Error('User not found'); e.statusCode = 404; e.errorCode = 'USER_NOT_FOUND'; throw e; }
  return user.id;
};

// ── Farmer ──
const enrol = async (req, res, next) => {
  try {
    const farmerId = await resolveUserId(req);
    const { biometric, dedupe, queuedTaskUuid, acted } = await biometricService.enrol({ farmerId, ...req.body });
    return success(res, { message: 'Muzzle enrolled', data: { biometricUuid: biometric.biometric_uuid, dedupe, queuedTaskUuid, acted, note: 'Muzzle is a second factor — the 12-digit tag remains the statutory identity.' }, statusCode: 201 });
  } catch (err) { next(err); }
};

const listMine = async (req, res, next) => {
  try {
    const farmerId = await resolveUserId(req);
    return success(res, { message: 'My biometrics', data: await biometricService.listForFarmer(farmerId) });
  } catch (err) { next(err); }
};

const erase = async (req, res, next) => {
  try {
    const farmerId = await resolveUserId(req);
    return success(res, { message: 'Biometric erased', data: await biometricService.deleteBiometric(req.params.biometricUuid, farmerId) });
  } catch (err) { next(err); }
};

// ── Field (SURVEYOR / VET) — advisory claim match ──
const matchForClaim = async (req, res, next) => {
  try {
    const result = await biometricService.matchForClaim({ claimUuid: req.body.claimUuid, embedding: req.body.embedding });
    return success(res, { message: 'Muzzle match (advisory)', data: { ...result, note: 'Advisory only — the claim decision remains with the human reviewer.' } });
  } catch (err) { next(err); }
};

// ── Review queue (SURVEYOR) ──
const reviewQueue = async (req, res, next) => {
  try { return success(res, { message: 'Review queue', data: await biometricService.reviewQueue() }); }
  catch (err) { next(err); }
};

const resolveReview = async (req, res, next) => {
  try {
    const reviewerId = await resolveUserId(req).catch(() => null);
    const task = await biometricService.resolveReview(req.params.taskUuid, { reviewerId, decision: req.body.decision, note: req.body.note });
    return success(res, { message: 'Review resolved', data: { taskUuid: task.task_uuid, status: task.status } });
  } catch (err) { next(err); }
};

module.exports = { enrol, listMine, erase, matchForClaim, reviewQueue, resolveReview };
