/**
 * Farmer Service
 * Business logic for farmer profile, onboarding, addresses, bank accounts, and preferences.
 */

const { Op } = require('sequelize');
const config = require('../../../config');
const logger = require('../../../shared/utils/logger');
const { generateUUID } = require('../../../shared/utils/uuidHelper');
const { encrypt } = require('../../../shared/utils/encryptionHelper');

// Lazy-load models to avoid circular dependency at startup
let db;
const getDb = () => {
  if (!db) db = require('../../../shared/models');
  return db;
};

// ─── Completeness Categories & Weights ─────────────────────────────

const COMPLETENESS_CATEGORIES = {
  personal: { fields: ['full_name', 'date_of_birth', 'gender', 'father_name'], weight: 25 },
  contact: { fields: ['aadhaar_number'], weight: 20 },
  location: { weight: 25 },
  bank: { weight: 20 },
  preferences: { weight: 10 },
};

/**
 * Masks a bank account number showing only last 4 digits.
 * @param {string} accountNumber - Raw account number
 * @returns {string} Masked account number (e.g. "XXXX XXXX 1234")
 */
const maskAccountNumber = (accountNumber) => {
  if (!accountNumber || accountNumber.length < 4) return 'XXXX';
  const last4 = accountNumber.slice(-4);
  const masked = 'X'.repeat(accountNumber.length - 4);
  return `${masked}${last4}`;
};

/**
 * Calculates profile completeness percentage and updates scores.
 * @param {number} farmerId - Internal user ID
 * @returns {Promise<number>} Overall completeness percentage
 */
const calculateCompleteness = async (farmerId) => {
  const { FarmerProfile, FarmerAddress, FarmerBankAccount, FarmerActivityPreference, ProfileCompletenessScore } = getDb();

  const profile = await FarmerProfile.findOne({ where: { farmer_id: farmerId } });
  if (!profile) return 0;

  const scores = {};

  // Personal info
  const personalFields = COMPLETENESS_CATEGORIES.personal.fields;
  const filledPersonal = personalFields.filter((f) => profile[f]).length;
  scores.personal = Math.round((filledPersonal / personalFields.length) * 100);

  // Contact / KYC
  scores.contact = profile.aadhaar_number ? 100 : 0;

  // Location
  const addressCount = await FarmerAddress.count({ where: { farmer_id: farmerId, is_active: true } });
  scores.location = addressCount > 0 ? 100 : 0;

  // Bank
  const bankCount = await FarmerBankAccount.count({ where: { farmer_id: farmerId, is_active: true } });
  scores.bank = bankCount > 0 ? 100 : 0;

  // Preferences
  const prefs = await FarmerActivityPreference.findOne({ where: { farmer_id: farmerId, is_active: true } });
  scores.preferences = prefs ? 100 : 0;

  // Weighted overall
  let overall = 0;
  for (const [cat, config] of Object.entries(COMPLETENESS_CATEGORIES)) {
    overall += (scores[cat] || 0) * (config.weight / 100);
  }
  overall = Math.round(overall);

  // Upsert category scores
  for (const [cat, score] of Object.entries(scores)) {
    await ProfileCompletenessScore.upsert({
      farmer_id: farmerId,
      category: cat,
      score_percentage: score,
      last_updated: new Date(),
    });
  }

  // Update profile
  await profile.update({ profile_completeness_percentage: overall });

  return overall;
};

/**
 * Records an onboarding step completion.
 * @param {number} farmerId - Internal user ID
 * @param {number} stepNumber - Step number (1-4)
 * @param {string} stepName - Step name
 * @param {Object} data - Submitted data snapshot
 */
const recordOnboardingStep = async (farmerId, stepNumber, stepName, data) => {
  const { OnboardingProgress } = getDb();
  await OnboardingProgress.upsert({
    farmer_id: farmerId,
    step_number: stepNumber,
    step_name: stepName,
    is_completed: true,
    completed_at: new Date(),
    data_snapshot: data,
  });
};

/**
 * Logs an audit entry for PII changes (Aadhaar, bank account).
 * @param {number} userId - User who made the change
 * @param {string} action - Action performed
 * @param {string} resourceType - Resource type
 * @param {*} resourceId - Resource ID
 * @param {Object} previousData - Data before change
 * @param {Object} newData - Data after change
 * @param {string} requestId - Request trace ID
 */
const auditLog = async (userId, action, resourceType, resourceId, previousData, newData, requestId) => {
  const { AuditLog } = getDb();
  try {
    await AuditLog.create({
      user_id: userId, action, resource_type: resourceType,
      resource_id: resourceId, previous_data: previousData,
      new_data: newData, request_id: requestId,
    });
  } catch (err) {
    logger.error('Audit log failed:', err.message);
  }
};

// ─── Onboarding ────────────────────────────────────────────────────

/**
 * Onboarding Step 1: Personal information.
 * Creates or updates the farmer profile with basic personal data.
 * @param {number} farmerId - Internal user ID (from JWT)
 * @param {Object} data - Step 1 payload
 * @returns {Promise<Object>} Updated farmer profile
 */
const onboardingStep1 = async (farmerId, data) => {
  const db = getDb();
  const { FarmerProfile, User } = db;
  const { firstName, lastName, dateOfBirth, gender, fatherName, motherName, educationLevel, maritalStatus } = data;

  const fullName = [firstName, lastName].filter(Boolean).join(' ');

  const transaction = await db.sequelize.transaction();
  try {
    // Update User record
    await User.update({ first_name: firstName, last_name: lastName || null }, { where: { id: farmerId }, transaction });

    // Upsert FarmerProfile
    let profile = await FarmerProfile.findOne({ where: { farmer_id: farmerId }, transaction });
    const profileData = {
      full_name: fullName,
      date_of_birth: dateOfBirth,
      gender,
      father_name: fatherName || null,
      mother_name: motherName || null,
      education_level: educationLevel || null,
      marital_status: maritalStatus || null,
      onboarding_status: 'step1_personal',
    };

    if (profile) {
      await profile.update(profileData, { transaction });
    } else {
      profile = await FarmerProfile.create({
        farmer_id: farmerId,
        profile_uuid: generateUUID(),
        ...profileData,
      }, { transaction });
    }

    await transaction.commit();

    await recordOnboardingStep(farmerId, 1, 'personal', data);
    await calculateCompleteness(farmerId);

    logger.info(`Onboarding step 1 completed for farmer ${farmerId}`);
    return { farmerProfile: profile.toJSON(), completionStep: 1 };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
};

/**
 * Onboarding Step 2: Contact & KYC (Aadhaar).
 * Encrypts Aadhaar with KMS and logs audit trail.
 * @param {number} farmerId - Internal user ID
 * @param {Object} data - Step 2 payload
 * @param {string} requestId - Request trace ID
 * @returns {Promise<Object>}
 */
const onboardingStep2 = async (farmerId, data, requestId) => {
  const db = getDb();
  const { FarmerProfile, User } = db;
  const { mobile, email, aadhaarNumber } = data;

  const profile = await FarmerProfile.findOne({ where: { farmer_id: farmerId } });
  if (!profile) {
    const err = new Error('Complete step 1 first');
    err.statusCode = 400; err.errorCode = 'VAL_001';
    throw err;
  }

  const transaction = await db.sequelize.transaction();
  try {
    // Update user contact if provided
    if (mobile || email) {
      const contactData = {};
      if (mobile) contactData.mobile = mobile.startsWith('+91') ? mobile : `+91${mobile}`;
      if (email) contactData.email = email.toLowerCase();
      await User.update(contactData, { where: { id: farmerId }, transaction });
    }

    // Encrypt and store Aadhaar
    const updateData = { onboarding_status: 'step2_contact' };
    if (aadhaarNumber) {
      const encryptionKey = process.env.AADHAAR_ENCRYPTION_KEY;
      if (!encryptionKey) {
        const err = new Error('AADHAAR_ENCRYPTION_KEY environment variable is not configured');
        err.statusCode = 500; err.errorCode = 'CFG_001';
        throw err;
      }
      updateData.aadhaar_number = encrypt(aadhaarNumber, encryptionKey);
      updateData.aadhaar_encrypted_by_kms = true;
      updateData.aadhaar_audit_logged = true;

      logger.info(`Aadhaar encrypted and stored for farmer ${farmerId}`);
    }

    await profile.update(updateData, { transaction });
    await transaction.commit();

    // Audit and progress tracking outside transaction (non-critical)
    if (aadhaarNumber) {
      await auditLog(farmerId, 'AADHAAR_STORED', 'farmer_profile', profile.id,
        null, { aadhaar_last4: aadhaarNumber.slice(-4) }, requestId);
    }
    await recordOnboardingStep(farmerId, 2, 'contact', { mobile, email, aadhaar_stored: !!aadhaarNumber });
    await calculateCompleteness(farmerId);

    return { farmerProfile: profile.toJSON(), completionStep: 2 };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
};

/**
 * Onboarding Step 3: Location.
 * Creates the farmer's primary address with LGD location references.
 * @param {number} farmerId - Internal user ID
 * @param {Object} data - Step 3 payload
 * @returns {Promise<Object>}
 */
const onboardingStep3 = async (farmerId, data) => {
  const { FarmerProfile, FarmerAddress } = getDb();

  const profile = await FarmerProfile.findOne({ where: { farmer_id: farmerId } });
  if (!profile || !['step1_personal', 'step2_contact'].includes(profile.onboarding_status)) {
    const err = new Error('Complete previous steps first');
    err.statusCode = 400; err.errorCode = 'VAL_001';
    throw err;
  }

  // Upsert permanent address
  const [address] = await FarmerAddress.upsert({
    farmer_id: farmerId,
    address_type: 'permanent',
    lgd_state_id: data.lgdStateId,
    lgd_district_id: data.lgdDistrictId,
    lgd_block_id: data.lgdBlockId || null,
    lgd_village_id: data.lgdVillageId || null,
    street_address: data.streetAddress || null,
    postal_code: data.postalCode || null,
    latitude: data.latitude || null,
    longitude: data.longitude || null,
    is_primary_address: true,
  });

  await profile.update({ onboarding_status: 'step3_location' });
  await recordOnboardingStep(farmerId, 3, 'location', data);
  await calculateCompleteness(farmerId);

  logger.info(`Onboarding step 3 completed for farmer ${farmerId}`);
  return { farmerProfile: profile.toJSON(), completionStep: 3 };
};

/**
 * Onboarding Step 4: Bank account.
 * Encrypts account number and marks onboarding as completed.
 * @param {number} farmerId - Internal user ID
 * @param {Object} data - Step 4 payload
 * @param {string} requestId - Request trace ID
 * @returns {Promise<Object>}
 */
const onboardingStep4 = async (farmerId, data, requestId) => {
  const db = getDb();
  const { FarmerProfile, FarmerBankAccount, FarmerActivityPreference } = db;

  const profile = await FarmerProfile.findOne({ where: { farmer_id: farmerId } });
  if (!profile || !['step2_contact', 'step3_location'].includes(profile.onboarding_status)) {
    const err = new Error('Complete previous steps first');
    err.statusCode = 400; err.errorCode = 'VAL_001';
    throw err;
  }

  // Encrypt account number
  const encryptionKey = process.env.BANK_ENCRYPTION_KEY;
  if (!encryptionKey) {
    const err = new Error('BANK_ENCRYPTION_KEY environment variable is not configured');
    err.statusCode = 500; err.errorCode = 'CFG_001';
    throw err;
  }
  const encryptedAccount = encrypt(data.accountNumber, encryptionKey);
  const maskedAccount = maskAccountNumber(data.accountNumber);

  const transaction = await db.sequelize.transaction();
  try {
    const bankAccount = await FarmerBankAccount.create({
      farmer_id: farmerId,
      account_holder_name: data.accountHolderName,
      bank_name: data.bankName,
      account_number: encryptedAccount,
      account_number_masked: maskedAccount,
      ifsc_code: data.ifscCode.toUpperCase(),
      account_type: data.accountType || 'savings',
      is_primary_account: true,
    }, { transaction });

    // Create default preferences
    await FarmerActivityPreference.upsert({
      farmer_id: farmerId,
      prefers_mobile_app: true,
      prefers_sms: true,
      notification_frequency: 'daily',
      preferred_language: 'en',
    }, { transaction });

    // Mark onboarding complete
    await profile.update({
      onboarding_status: 'completed',
      onboarding_completed_at: new Date(),
      bank_account_verified: false,
    }, { transaction });

    await transaction.commit();

    // Non-critical operations outside transaction
    await auditLog(farmerId, 'BANK_ACCOUNT_ADDED', 'farmer_bank_account', bankAccount.id,
      null, { bank_name: data.bankName, masked: maskedAccount }, requestId);
    await recordOnboardingStep(farmerId, 4, 'bank', { bankName: data.bankName, masked: maskedAccount });
    await calculateCompleteness(farmerId);

    logger.info(`Onboarding completed for farmer ${farmerId}`);
    return { farmerProfile: profile.toJSON(), completionStep: 4, onboardingCompleted: true };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
};

// ─── Profile CRUD ──────────────────────────────────────────────────

/**
 * Gets the full farmer profile with addresses, bank accounts, and preferences.
 * @param {number} farmerId - Internal user ID
 * @returns {Promise<Object>} Complete profile object
 */
const getProfile = async (farmerId) => {
  const { FarmerProfile, FarmerProfileDetail, FarmerAddress, FarmerBankAccount, FarmerActivityPreference, ProfileCompletenessScore } = getDb();

  const profile = await FarmerProfile.findOne({
    where: { farmer_id: farmerId, is_active: true },
    include: [{ model: FarmerProfileDetail, as: 'details' }],
  });

  if (!profile) {
    const err = new Error('Farmer profile not found');
    err.statusCode = 404; err.errorCode = 'RES_001';
    throw err;
  }

  const [addresses, bankAccounts, preferences, completenessScores] = await Promise.all([
    FarmerAddress.findAll({ where: { farmer_id: farmerId, is_active: true } }),
    FarmerBankAccount.findAll({
      where: { farmer_id: farmerId, is_active: true },
      attributes: { exclude: ['account_number'] },
    }),
    FarmerActivityPreference.findOne({ where: { farmer_id: farmerId, is_active: true } }),
    ProfileCompletenessScore.findAll({ where: { farmer_id: farmerId, is_active: true } }),
  ]);

  // Remove encrypted Aadhaar from response
  const profileData = profile.toJSON();
  delete profileData.aadhaar_number;

  return {
    profile: profileData,
    addresses,
    bankAccounts,
    activityPreferences: preferences,
    completenessScores,
  };
};

/**
 * Updates the farmer profile.
 * @param {number} farmerId - Internal user ID
 * @param {Object} data - Fields to update
 * @returns {Promise<Object>} Updated profile
 */
const updateProfile = async (farmerId, data) => {
  const { FarmerProfile } = getDb();

  const profile = await FarmerProfile.findOne({ where: { farmer_id: farmerId, is_active: true } });
  if (!profile) {
    const err = new Error('Farmer profile not found');
    err.statusCode = 404; err.errorCode = 'RES_001';
    throw err;
  }

  const updateFields = {};
  if (data.fullName) updateFields.full_name = data.fullName;
  if (data.dateOfBirth) updateFields.date_of_birth = data.dateOfBirth;
  if (data.gender) updateFields.gender = data.gender;
  if (data.fatherName !== undefined) updateFields.father_name = data.fatherName;
  if (data.motherName !== undefined) updateFields.mother_name = data.motherName;
  if (data.educationLevel) updateFields.education_level = data.educationLevel;
  if (data.maritalStatus) updateFields.marital_status = data.maritalStatus;
  if (data.primaryCrop !== undefined) updateFields.primary_crop = data.primaryCrop;
  if (data.secondaryCrops !== undefined) updateFields.secondary_crops = data.secondaryCrops;
  if (data.yearsExperience !== undefined) updateFields.years_farming_experience = data.yearsExperience;
  if (data.totalFarmSizeHectares !== undefined) updateFields.total_farm_size_hectares = data.totalFarmSizeHectares;
  if (data.landOwnershipType) updateFields.land_ownership_type = data.landOwnershipType;
  if (data.gstNumber !== undefined) {
    updateFields.gst_number = data.gstNumber;
    updateFields.gst_registered = !!data.gstNumber;
  }

  await profile.update(updateFields);
  await calculateCompleteness(farmerId);

  logger.info(`Profile updated for farmer ${farmerId}`);
  return { profile: profile.toJSON(), message: 'Profile updated' };
};

// ─── Addresses ─────────────────────────────────────────────────────

/**
 * Gets all addresses for a farmer.
 * @param {number} farmerId
 * @returns {Promise<Array>}
 */
const getAddresses = async (farmerId) => {
  const { FarmerAddress } = getDb();
  return FarmerAddress.findAll({ where: { farmer_id: farmerId, is_active: true } });
};

/**
 * Creates a new address for a farmer.
 * @param {number} farmerId
 * @param {Object} data
 * @returns {Promise<Object>}
 */
const createAddress = async (farmerId, data) => {
  const { FarmerAddress } = getDb();

  // If setting as primary, unset other primaries
  if (data.isPrimaryAddress) {
    await FarmerAddress.update({ is_primary_address: false }, { where: { farmer_id: farmerId } });
  }

  const address = await FarmerAddress.create({
    farmer_id: farmerId,
    address_type: data.addressType,
    lgd_state_id: data.lgdStateId || null,
    lgd_district_id: data.lgdDistrictId || null,
    lgd_block_id: data.lgdBlockId || null,
    lgd_village_id: data.lgdVillageId || null,
    street_address: data.streetAddress || null,
    postal_code: data.postalCode || null,
    latitude: data.latitude || null,
    longitude: data.longitude || null,
    is_primary_address: data.isPrimaryAddress || false,
  });

  await calculateCompleteness(farmerId);
  return address;
};

// ─── Bank Accounts ─────────────────────────────────────────────────

/**
 * Gets all bank accounts for a farmer (with masked account numbers).
 * @param {number} farmerId
 * @returns {Promise<Array>}
 */
const getBankAccounts = async (farmerId) => {
  const { FarmerBankAccount } = getDb();
  return FarmerBankAccount.findAll({
    where: { farmer_id: farmerId, is_active: true },
    attributes: { exclude: ['account_number'] },
  });
};

/**
 * Creates a new bank account for a farmer with encrypted account number.
 * @param {number} farmerId
 * @param {Object} data
 * @param {string} requestId
 * @returns {Promise<Object>}
 */
const createBankAccount = async (farmerId, data, requestId) => {
  const { FarmerBankAccount } = getDb();

  const encryptionKey = process.env.BANK_ENCRYPTION_KEY;
  if (!encryptionKey) {
    const err = new Error('BANK_ENCRYPTION_KEY environment variable is not configured');
    err.statusCode = 500; err.errorCode = 'CFG_001';
    throw err;
  }
  const encryptedAccount = encrypt(data.accountNumber, encryptionKey);
  const maskedAccount = maskAccountNumber(data.accountNumber);

  const bankAccount = await FarmerBankAccount.create({
    farmer_id: farmerId,
    account_holder_name: data.accountHolderName,
    bank_name: data.bankName,
    account_number: encryptedAccount,
    account_number_masked: maskedAccount,
    ifsc_code: data.ifscCode.toUpperCase(),
    account_type: data.accountType || 'savings',
  });

  await auditLog(farmerId, 'BANK_ACCOUNT_ADDED', 'farmer_bank_account', bankAccount.id,
    null, { bank_name: data.bankName, masked: maskedAccount }, requestId);
  await calculateCompleteness(farmerId);

  // Return without raw account number
  const result = bankAccount.toJSON();
  delete result.account_number;
  return { bankAccount: result, message: 'Bank account added' };
};

/**
 * Updates a bank account (e.g. set as primary).
 * @param {number} farmerId
 * @param {number} accountId
 * @param {Object} data
 * @returns {Promise<Object>}
 */
const updateBankAccount = async (farmerId, accountId, data) => {
  const { FarmerBankAccount } = getDb();

  const account = await FarmerBankAccount.findOne({
    where: { id: accountId, farmer_id: farmerId, is_active: true },
  });

  if (!account) {
    const err = new Error('Bank account not found');
    err.statusCode = 404; err.errorCode = 'RES_001';
    throw err;
  }

  if (data.isPrimary) {
    await FarmerBankAccount.update({ is_primary_account: false }, { where: { farmer_id: farmerId } });
    await account.update({ is_primary_account: true });
  }

  return { message: 'Primary account updated' };
};

// ─── Preferences ───────────────────────────────────────────────────

/**
 * Gets farmer activity and language preferences.
 * @param {number} farmerId
 * @returns {Promise<Object>}
 */
const getPreferences = async (farmerId) => {
  const { FarmerActivityPreference, FarmerLanguagePreference } = getDb();

  const [activityPreferences, languagePreferences] = await Promise.all([
    FarmerActivityPreference.findOne({ where: { farmer_id: farmerId, is_active: true } }),
    FarmerLanguagePreference.findAll({ where: { farmer_id: farmerId, is_active: true }, order: [['preferred_order', 'ASC']] }),
  ]);

  return { activityPreferences, languagePreferences };
};

/**
 * Updates farmer activity preferences.
 * @param {number} farmerId
 * @param {Object} data
 * @returns {Promise<Object>}
 */
const updatePreferences = async (farmerId, data) => {
  const { FarmerActivityPreference } = getDb();

  const updateFields = {};
  if (data.preferredLanguage !== undefined) updateFields.preferred_language = data.preferredLanguage;
  if (data.notificationFrequency !== undefined) updateFields.notification_frequency = data.notificationFrequency;
  if (data.prefersMobileApp !== undefined) updateFields.prefers_mobile_app = data.prefersMobileApp;
  if (data.prefersSms !== undefined) updateFields.prefers_sms = data.prefersSms;
  if (data.prefersCall !== undefined) updateFields.prefers_call = data.prefersCall;
  if (data.prefersEmail !== undefined) updateFields.prefers_email = data.prefersEmail;
  if (data.preferredTimeWindowStart !== undefined) updateFields.preferred_time_window_start = data.preferredTimeWindowStart;
  if (data.preferredTimeWindowEnd !== undefined) updateFields.preferred_time_window_end = data.preferredTimeWindowEnd;

  const [preferences] = await FarmerActivityPreference.upsert({
    farmer_id: farmerId,
    ...updateFields,
  });

  await calculateCompleteness(farmerId);
  return { preferences };
};

// ─── My Activities (Income Streams + Persona) ─────────────────────

/**
 * Classifies a farmer's income persona based on agricultural activity count.
 * @param {Array} streams - Active income stream records
 * @returns {string} single_income | double_income | triple_income | quad_income
 */
const classifyPersona = (streams) => {
  const agriTypes = new Set();
  for (const s of streams) {
    const t = (s.stream_type || '').toLowerCase();
    if (['crop', 'dairy', 'fisheries', 'horticulture'].includes(t)) agriTypes.add(t);
  }
  const count = agriTypes.size;
  if (count >= 4) return 'quad_income';
  if (count >= 3) return 'triple_income';
  if (count >= 2) return 'double_income';
  return 'single_income';
};

/**
 * Returns farmer's active income streams with persona classification.
 * Used by the farmer mobile app to render dynamic multi-activity farm tab.
 * @param {number} farmerId - Internal user ID
 * @returns {Promise<Object>} { activities, persona, streams, totalAnnualIncome }
 */
const getMyActivities = async (farmerId) => {
  const { FarmerIncomeStream, FarmerProfileDetail } = getDb();

  const incomeStreams = await FarmerIncomeStream.findAll({
    where: { farmer_id: farmerId, is_active: true },
    order: [['annual_income', 'DESC']],
  });

  const activities = [];
  const streams = [];
  let totalAnnualIncome = 0;

  for (const s of incomeStreams) {
    const streamType = (s.stream_type || '').toLowerCase();
    if (!activities.includes(streamType)) activities.push(streamType);
    totalAnnualIncome += parseFloat(s.annual_income || 0);
    streams.push({
      type: s.stream_type,
      annualIncome: parseFloat(s.annual_income || 0),
      stability: s.income_stability_rating || 'moderate',
      description: s.income_source_description,
    });
  }

  const persona = classifyPersona(incomeStreams);

  // Get family details if available
  let familySize = null;
  let earningMembers = null;
  try {
    const profileDetail = await FarmerProfileDetail.findOne({ where: { farmer_id: farmerId } });
    if (profileDetail) {
      familySize = profileDetail.family_members || null;
      // dependents_count can approximate non-earning members
    }
  } catch (e) {
    // FarmerProfileDetail may not exist for all farmers
  }

  return {
    activities,
    persona,
    streams,
    totalAnnualIncome,
    familySize,
    earningMembers,
  };
};

module.exports = {
  onboardingStep1,
  onboardingStep2,
  onboardingStep3,
  onboardingStep4,
  getProfile,
  updateProfile,
  getAddresses,
  createAddress,
  getBankAccounts,
  createBankAccount,
  updateBankAccount,
  getPreferences,
  updatePreferences,
  maskAccountNumber,
  calculateCompleteness,
  getMyActivities,
};
