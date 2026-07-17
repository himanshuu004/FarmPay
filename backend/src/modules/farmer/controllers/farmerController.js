/**
 * Farmer Controller
 * Handles HTTP requests for farmer profile, onboarding, addresses, bank accounts, and preferences.
 */

const farmerService = require('../services/farmerService');
const { success } = require('../../../shared/utils/responseHelper');
const STATUS_CODES = require('../../../shared/constants/statusCodes');
const { User } = require('../../../shared/models');

/**
 * Resolves the internal user ID from the JWT user_id (UUID).
 * @param {Object} req - Express request with req.user.id (UUID)
 * @returns {Promise<number>} Internal user ID
 */
const resolveUserId = async (req) => {
  const user = await User.findOne({ where: { user_id: req.user.id, is_active: true } });
  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 404; err.errorCode = 'RES_001';
    throw err;
  }
  return user.id;
};

/** POST /farmer/onboarding/step1 */
const onboardingStep1 = async (req, res, next) => {
  try {
    const farmerId = await resolveUserId(req);
    const result = await farmerService.onboardingStep1(farmerId, req.body);
    return success(res, { message: 'Personal information saved', data: result, statusCode: STATUS_CODES.CREATED });
  } catch (err) { next(err); }
};

/** POST /farmer/onboarding/step2 */
const onboardingStep2 = async (req, res, next) => {
  try {
    const farmerId = await resolveUserId(req);
    const result = await farmerService.onboardingStep2(farmerId, req.body, req.requestId);
    return success(res, { message: 'Contact and KYC information saved. Aadhaar encrypted with KMS', data: result });
  } catch (err) { next(err); }
};

/** POST /farmer/onboarding/step3 */
const onboardingStep3 = async (req, res, next) => {
  try {
    const farmerId = await resolveUserId(req);
    const result = await farmerService.onboardingStep3(farmerId, req.body);
    return success(res, { message: 'Location information saved', data: result });
  } catch (err) { next(err); }
};

/** POST /farmer/onboarding/step4 */
const onboardingStep4 = async (req, res, next) => {
  try {
    const farmerId = await resolveUserId(req);
    const result = await farmerService.onboardingStep4(farmerId, req.body, req.requestId);
    return success(res, { message: 'Bank account saved. Onboarding completed!', data: result });
  } catch (err) { next(err); }
};

/** GET /farmer/profile */
const getProfile = async (req, res, next) => {
  try {
    const farmerId = await resolveUserId(req);
    const result = await farmerService.getProfile(farmerId);
    return success(res, { message: 'Profile retrieved successfully', data: result });
  } catch (err) { next(err); }
};

/** PUT /farmer/profile */
const updateProfile = async (req, res, next) => {
  try {
    const farmerId = await resolveUserId(req);
    const result = await farmerService.updateProfile(farmerId, req.body);
    return success(res, { message: result.message, data: result });
  } catch (err) { next(err); }
};

/** GET /farmer/addresses */
const getAddresses = async (req, res, next) => {
  try {
    const farmerId = await resolveUserId(req);
    const addresses = await farmerService.getAddresses(farmerId);
    return success(res, { message: 'Addresses retrieved', data: addresses });
  } catch (err) { next(err); }
};

/** POST /farmer/addresses */
const createAddress = async (req, res, next) => {
  try {
    const farmerId = await resolveUserId(req);
    const address = await farmerService.createAddress(farmerId, req.body);
    return success(res, { message: 'Address created', data: { address }, statusCode: STATUS_CODES.CREATED });
  } catch (err) { next(err); }
};

/** GET /farmer/bank-accounts */
const getBankAccounts = async (req, res, next) => {
  try {
    const farmerId = await resolveUserId(req);
    const accounts = await farmerService.getBankAccounts(farmerId);
    return success(res, { message: 'Bank accounts retrieved', data: accounts });
  } catch (err) { next(err); }
};

/** POST /farmer/bank-accounts */
const createBankAccount = async (req, res, next) => {
  try {
    const farmerId = await resolveUserId(req);
    const result = await farmerService.createBankAccount(farmerId, req.body, req.requestId);
    return success(res, { message: result.message, data: result, statusCode: STATUS_CODES.CREATED });
  } catch (err) { next(err); }
};

/** PUT /farmer/bank-accounts/:accountId */
const updateBankAccount = async (req, res, next) => {
  try {
    const farmerId = await resolveUserId(req);
    const result = await farmerService.updateBankAccount(farmerId, parseInt(req.params.accountId, 10), req.body);
    return success(res, { message: result.message, data: result });
  } catch (err) { next(err); }
};

/** GET /farmer/preferences */
const getPreferences = async (req, res, next) => {
  try {
    const farmerId = await resolveUserId(req);
    const result = await farmerService.getPreferences(farmerId);
    return success(res, { message: 'Preferences retrieved', data: result });
  } catch (err) { next(err); }
};

/** PUT /farmer/preferences */
const updatePreferences = async (req, res, next) => {
  try {
    const farmerId = await resolveUserId(req);
    const result = await farmerService.updatePreferences(farmerId, req.body);
    return success(res, { message: 'Preferences updated', data: result });
  } catch (err) { next(err); }
};

/** GET /farmer/my-activities */
const getMyActivities = async (req, res, next) => {
  try {
    const farmerId = await resolveUserId(req);
    const result = await farmerService.getMyActivities(farmerId);
    return success(res, { message: 'Farmer activities retrieved', data: result });
  } catch (err) { next(err); }
};

/**
 * Get address version history for a specific address.
 */
const getAddressHistory = async (req, res, next) => {
  try {
    const db = require('../../../shared/models');
    const history = await db.FarmerAddressHistory.findAll({
      where: { farmer_address_id: parseInt(req.params.addressId), farmer_id: req.user.id },
      order: [['version_number', 'DESC']],
    });
    return success(res, { message: 'Address history retrieved', data: history });
  } catch (err) { next(err); }
};

module.exports = {
  onboardingStep1, onboardingStep2, onboardingStep3, onboardingStep4,
  getProfile, updateProfile,
  getAddresses, createAddress,
  getBankAccounts, createBankAccount, updateBankAccount,
  getPreferences, updatePreferences,
  getMyActivities,
  getAddressHistory,
};
