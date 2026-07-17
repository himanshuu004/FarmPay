/**
 * Compliance Service
 * Consent management, grievance handling, fee disclosure, and cooling-off checks.
 */

const { Op } = require('sequelize');
const { generateUUID } = require('../../../shared/utils/uuidHelper');
const logger = require('../../../shared/utils/logger');

let db;
const getDb = () => {
  if (!db) db = require('../../../shared/models');
  return db;
};

/**
 * Records farmer consent for a specific type.
 */
const recordConsent = async (farmerId, { consentType, version, ipAddress, userAgent }) => {
  const { ConsentRecord } = getDb();

  const consent = await ConsentRecord.create({
    consent_uuid: generateUUID(),
    farmer_id: farmerId,
    consent_type: consentType,
    consent_version: version,
    accepted: true,
    accepted_at: new Date(),
    ip_address: ipAddress || null,
    user_agent: userAgent || null,
    is_active: true,
  });

  logger.info(`Consent recorded: farmer=${farmerId}, type=${consentType}, version=${version}`);

  return {
    consentId: consent.consent_uuid,
    consentType: consent.consent_type,
    acceptedAt: consent.accepted_at,
  };
};

/**
 * Withdraws active consent for a farmer by type.
 */
const withdrawConsent = async (farmerId, consentType) => {
  const { ConsentRecord } = getDb();

  const consent = await ConsentRecord.findOne({
    where: {
      farmer_id: farmerId,
      consent_type: consentType,
      is_active: true,
      withdrawn_at: null,
    },
    order: [['created_at', 'DESC']],
  });

  if (!consent) {
    const err = new Error(`No active consent found for type: ${consentType}`);
    err.statusCode = 404;
    err.errorCode = 'COMPLIANCE_001';
    throw err;
  }

  const now = new Date();
  await consent.update({ withdrawn_at: now, is_active: false });

  logger.info(`Consent withdrawn: farmer=${farmerId}, type=${consentType}`);

  return { withdrawn: true, withdrawnAt: now };
};

/**
 * Gets latest consent status per type for a farmer.
 */
const getConsentStatus = async (farmerId) => {
  const { ConsentRecord } = getDb();

  const records = await ConsentRecord.findAll({
    where: { farmer_id: farmerId },
    order: [['created_at', 'DESC']],
  });

  // Group by consent_type and return latest per type
  const grouped = {};
  for (const record of records) {
    if (!grouped[record.consent_type]) {
      grouped[record.consent_type] = {
        consentType: record.consent_type,
        consentVersion: record.consent_version,
        accepted: record.accepted,
        acceptedAt: record.accepted_at,
        withdrawnAt: record.withdrawn_at,
        isActive: record.is_active,
      };
    }
  }

  return Object.values(grouped);
};

/**
 * Files a new grievance for a farmer.
 */
const fileGrievance = async (farmerId, { category, description, priority }) => {
  const { GrievanceRecord } = getDb();

  const grievance = await GrievanceRecord.create({
    grievance_uuid: generateUUID(),
    farmer_id: farmerId,
    category,
    description,
    priority: priority || 'medium',
    status: 'filed',
    is_active: true,
  });

  logger.info(`Grievance filed: farmer=${farmerId}, category=${category}, id=${grievance.grievance_uuid}`);

  return {
    grievanceId: grievance.grievance_uuid,
    status: grievance.status,
    filedAt: grievance.created_at,
  };
};

/**
 * Gets a specific grievance by UUID for a farmer.
 */
const getGrievanceStatus = async (farmerId, grievanceId) => {
  const { GrievanceRecord } = getDb();

  const grievance = await GrievanceRecord.findOne({
    where: { farmer_id: farmerId, grievance_uuid: grievanceId, is_active: true },
  });

  if (!grievance) {
    const err = new Error('Grievance not found');
    err.statusCode = 404;
    err.errorCode = 'COMPLIANCE_002';
    throw err;
  }

  return {
    grievanceId: grievance.grievance_uuid,
    category: grievance.category,
    description: grievance.description,
    priority: grievance.priority,
    status: grievance.status,
    assignedTo: grievance.assigned_to,
    resolution: grievance.resolution,
    resolvedAt: grievance.resolved_at,
    escalatedAt: grievance.escalated_at,
    escalationReason: grievance.escalation_reason,
    filedAt: grievance.created_at,
  };
};

/**
 * Lists all grievances for a farmer, ordered by created_at DESC.
 */
const listGrievances = async (farmerId) => {
  const { GrievanceRecord } = getDb();

  const grievances = await GrievanceRecord.findAll({
    where: { farmer_id: farmerId, is_active: true },
    order: [['created_at', 'DESC']],
  });

  return grievances.map((g) => ({
    grievanceId: g.grievance_uuid,
    category: g.category,
    priority: g.priority,
    status: g.status,
    description: g.description,
    filedAt: g.created_at,
    resolvedAt: g.resolved_at,
  }));
};

/**
 * Fetches fee disclosure for a loan product.
 */
const getFeeDisclosure = async (productId) => {
  const { LoanProduct } = getDb();

  const product = await LoanProduct.findOne({
    where: { id: productId, is_active: true },
  });

  if (!product) {
    const err = new Error('Loan product not found');
    err.statusCode = 404;
    err.errorCode = 'COMPLIANCE_003';
    throw err;
  }

  return {
    productId: product.id,
    productName: product.product_name,
    feeSchedule: {
      processingFeePercent: product.processing_fee_percent,
      interestRateMin: product.interest_rate_min,
      interestRateMax: product.interest_rate_max,
      interestType: product.interest_type,
      penalInterestRate: product.penal_interest_rate,
      prepaymentChargePercent: product.prepayment_charge_percent,
    },
    disclaimer: 'All fees are subject to applicable taxes. Please read the full terms and conditions before applying.',
  };
};

/**
 * Checks if a loan application is within the 14-day cooling-off period.
 */
const checkCoolingOff = async (applicationId) => {
  const { LoanApplication } = getDb();

  const application = await LoanApplication.findOne({
    where: { id: applicationId, is_active: true },
  });

  if (!application) {
    const err = new Error('Loan application not found');
    err.statusCode = 404;
    err.errorCode = 'COMPLIANCE_004';
    throw err;
  }

  const approvedAt = application.approved_at;
  if (!approvedAt) {
    return {
      withinCoolingOff: false,
      message: 'Application has not been approved yet',
    };
  }

  const coolingOffDays = 14;
  const deadline = new Date(approvedAt);
  deadline.setDate(deadline.getDate() + coolingOffDays);

  const now = new Date();
  const withinCoolingOff = deadline > now;
  const daysRemaining = withinCoolingOff
    ? Math.ceil((deadline - now) / (1000 * 60 * 60 * 24))
    : 0;

  return {
    withinCoolingOff,
    deadline: deadline.toISOString(),
    daysRemaining,
    approvedAt: approvedAt,
  };
};

module.exports = {
  recordConsent,
  withdrawConsent,
  getConsentStatus,
  fileGrievance,
  getGrievanceStatus,
  listGrievances,
  getFeeDisclosure,
  checkCoolingOff,
};
