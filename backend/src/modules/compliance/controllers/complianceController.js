/**
 * Compliance Controller
 * Handles consent, grievance, fee disclosure, and cooling-off endpoints.
 */

const complianceService = require('../services/complianceService');
const { success } = require('../../../shared/utils/responseHelper');
const { User } = require('../../../shared/models');

const resolveUserId = async (req) => {
  const user = await User.findOne({ where: { user_id: req.user.id, is_active: true } });
  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 404;
    err.errorCode = 'RES_001';
    throw err;
  }
  return user.id;
};

/** POST /compliance/consent */
const recordConsent = async (req, res, next) => {
  try {
    const farmerId = await resolveUserId(req);
    const result = await complianceService.recordConsent(farmerId, {
      consentType: req.body.consentType,
      version: req.body.version,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    });
    return success(res, { message: 'Consent recorded successfully', data: result }, 201);
  } catch (err) { next(err); }
};

/** DELETE /compliance/consent/:consentType */
const withdrawConsent = async (req, res, next) => {
  try {
    const farmerId = await resolveUserId(req);
    const result = await complianceService.withdrawConsent(farmerId, req.params.consentType);
    return success(res, { message: 'Consent withdrawn successfully', data: result });
  } catch (err) { next(err); }
};

/** GET /compliance/consent */
const getConsentStatus = async (req, res, next) => {
  try {
    const farmerId = await resolveUserId(req);
    const result = await complianceService.getConsentStatus(farmerId);
    return success(res, { message: 'Consent status retrieved', data: result });
  } catch (err) { next(err); }
};

/** POST /compliance/grievance */
const fileGrievance = async (req, res, next) => {
  try {
    const farmerId = await resolveUserId(req);
    const result = await complianceService.fileGrievance(farmerId, {
      category: req.body.category,
      description: req.body.description,
      priority: req.body.priority,
    });
    return success(res, { message: 'Grievance filed successfully', data: result }, 201);
  } catch (err) { next(err); }
};

/** GET /compliance/grievance */
const listGrievances = async (req, res, next) => {
  try {
    const farmerId = await resolveUserId(req);
    const result = await complianceService.listGrievances(farmerId);
    return success(res, { message: 'Grievances retrieved', data: result });
  } catch (err) { next(err); }
};

/** GET /compliance/grievance/:grievanceId */
const getGrievanceStatus = async (req, res, next) => {
  try {
    const farmerId = await resolveUserId(req);
    const result = await complianceService.getGrievanceStatus(farmerId, req.params.grievanceId);
    return success(res, { message: 'Grievance status retrieved', data: result });
  } catch (err) { next(err); }
};

/** GET /compliance/fee-disclosure/:productId */
const getFeeDisclosure = async (req, res, next) => {
  try {
    const result = await complianceService.getFeeDisclosure(parseInt(req.params.productId, 10));
    return success(res, { message: 'Fee disclosure retrieved', data: result });
  } catch (err) { next(err); }
};

/** GET /compliance/cooling-off/:applicationId */
const checkCoolingOff = async (req, res, next) => {
  try {
    const result = await complianceService.checkCoolingOff(parseInt(req.params.applicationId, 10));
    return success(res, { message: 'Cooling-off status retrieved', data: result });
  } catch (err) { next(err); }
};

module.exports = {
  recordConsent,
  withdrawConsent,
  getConsentStatus,
  fileGrievance,
  listGrievances,
  getGrievanceStatus,
  getFeeDisclosure,
  checkCoolingOff,
};
