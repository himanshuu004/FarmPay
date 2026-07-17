/**
 * Aadhaar Step-Up Authentication Service
 *
 * Handles UIDAI Aadhaar OTP verification for DICE financial operations.
 * This is a TIER-2 authentication layer — users must complete Tier-1 (mobile+password)
 * before invoking these endpoints.
 *
 * Security:
 * - Raw Aadhaar is never stored (only SHA-256 hash + last 4 for display)
 * - OTP is bcrypt-hashed before storage
 * - Step-up session tokens expire in 15 minutes
 * - Max 3 attempts per OTP request
 * - Mock UIDAI integration — in production, swap with real UIDAI AuthAPI v2.5
 */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { Op } = require('sequelize');
const { AadhaarVerification } = require('../../../shared/models');
const config = require('../../../config');
const logger = require('../../../shared/utils/logger');

// ─── Constants ─────────────────────────────────────────────────────
const STEP_UP_TOKEN_TTL_MINUTES = 15;
const OTP_TTL_MINUTES = 5;
const MAX_OTP_ATTEMPTS = 3;
const AADHAAR_REGEX = /^[2-9]\d{11}$/; // Aadhaar can't start with 0 or 1
const STEP_UP_ISSUER = config.jwt.issuer;
const STEP_UP_AUDIENCE = 'farmerpay-dice-stepup';

// ─── Helpers ───────────────────────────────────────────────────────
const hashAadhaar = (aadhaar) => crypto.createHash('sha256').update(aadhaar).digest('hex');

/**
 * Mock UIDAI OTP dispatch.
 * In production, this would call UIDAI Authentication API (v2.5) with
 * licensed AUA credentials. For demo, we generate a deterministic 6-digit OTP.
 *
 * DEMO OTP: 123456 (always accepted for demo purposes in non-production)
 */
const sendOtpToUidai = async (aadhaar) => {
  // In production: call UIDAI Auth API, return real transaction ID
  const otp = config.env === 'production' ? Math.floor(100000 + Math.random() * 900000).toString() : '123456';
  const txnId = `TXN-${uuidv4().substring(0, 8).toUpperCase()}`;
  logger.info(`[MOCK UIDAI] OTP ${otp} sent for Aadhaar ending ${aadhaar.slice(-4)} (txn: ${txnId})`);
  return { otp, txnId };
};

// ─── Service Methods ───────────────────────────────────────────────

/**
 * Initiate Aadhaar OTP flow
 * @param {number} userId - internal user ID (req.user.id from Tier-1 JWT)
 * @param {string} aadhaar - 12-digit Aadhaar number
 * @param {object} meta - { ipAddress, deviceFingerprint }
 * @returns {object} { otpRequestId, aadhaarLast4, expiresInSeconds }
 */
const initiateAadhaarOtp = async (userId, aadhaar, meta = {}) => {
  // 1. Validate format
  if (!aadhaar || !AADHAAR_REGEX.test(aadhaar)) {
    const err = new Error('Invalid Aadhaar number format');
    err.statusCode = 400;
    err.errorCode = 'AADHAAR_INVALID_FORMAT';
    throw err;
  }

  // 2. Rate limit: max 3 pending OTPs in last 10 minutes
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
  const recentCount = await AadhaarVerification.count({
    where: {
      user_id: userId,
      created_at: { [Op.gte]: tenMinutesAgo },
    },
  });
  if (recentCount >= 3) {
    const err = new Error('Too many OTP requests. Please try again in 10 minutes.');
    err.statusCode = 429;
    err.errorCode = 'AADHAAR_OTP_RATE_LIMITED';
    throw err;
  }

  // 3. Call (mock) UIDAI
  const { otp } = await sendOtpToUidai(aadhaar);

  // 4. Persist request
  const otpRequestId = uuidv4();
  const otpHash = await bcrypt.hash(otp, 10);
  const now = new Date();
  const otpExpiresAt = new Date(now.getTime() + OTP_TTL_MINUTES * 60 * 1000);

  const record = await AadhaarVerification.create({
    verification_uuid: uuidv4(),
    user_id: userId,
    aadhaar_hash: hashAadhaar(aadhaar),
    aadhaar_last4: aadhaar.slice(-4),
    otp_request_id: otpRequestId,
    otp_code_hash: otpHash,
    otp_sent_at: now,
    otp_expires_at: otpExpiresAt,
    status: 'pending',
    ip_address: meta.ipAddress || null,
    device_fingerprint: meta.deviceFingerprint || null,
  });

  return {
    otpRequestId,
    aadhaarLast4: record.aadhaar_last4,
    expiresInSeconds: OTP_TTL_MINUTES * 60,
    // surface for demo only — SHOW_DEV_OTP is an explicit pilot opt-in so
    // this never leaks in a real production deploy even though the pilot
    // backend itself runs with NODE_ENV=production (required for Supabase
    // pooler SSL, see backend/src/config/database.js)
    ...((config.env !== 'production' || process.env.SHOW_DEV_OTP === 'true') && { demoOtp: otp }),
  };
};

/**
 * Verify Aadhaar OTP and issue step-up session token
 * @param {number} userId
 * @param {string} otpRequestId
 * @param {string} otpCode - 6-digit OTP
 * @returns {object} { stepUpToken, expiresAt, aadhaarLast4 }
 */
const verifyAadhaarOtp = async (userId, otpRequestId, otpCode) => {
  if (!otpRequestId || !otpCode) {
    const err = new Error('otpRequestId and otpCode are required');
    err.statusCode = 400;
    err.errorCode = 'AADHAAR_OTP_MISSING_PARAMS';
    throw err;
  }

  const record = await AadhaarVerification.findOne({
    where: { otp_request_id: otpRequestId, user_id: userId },
  });

  if (!record) {
    const err = new Error('Verification session not found');
    err.statusCode = 404;
    err.errorCode = 'AADHAAR_SESSION_NOT_FOUND';
    throw err;
  }

  if (record.status !== 'pending') {
    const err = new Error(`Verification is ${record.status}`);
    err.statusCode = 400;
    err.errorCode = 'AADHAAR_SESSION_INVALID_STATE';
    throw err;
  }

  if (new Date() > record.otp_expires_at) {
    await record.update({ status: 'expired', failure_reason: 'OTP expired' });
    const err = new Error('OTP has expired');
    err.statusCode = 400;
    err.errorCode = 'AADHAAR_OTP_EXPIRED';
    throw err;
  }

  if (record.attempt_count >= MAX_OTP_ATTEMPTS) {
    await record.update({ status: 'failed', failure_reason: 'Max attempts exceeded' });
    const err = new Error('Max OTP attempts exceeded');
    err.statusCode = 400;
    err.errorCode = 'AADHAAR_OTP_MAX_ATTEMPTS';
    throw err;
  }

  const valid = await bcrypt.compare(otpCode, record.otp_code_hash);
  if (!valid) {
    await record.update({ attempt_count: record.attempt_count + 1 });
    const err = new Error('Invalid OTP');
    err.statusCode = 400;
    err.errorCode = 'AADHAAR_OTP_INVALID';
    throw err;
  }

  // Issue step-up JWT
  const jti = uuidv4();
  const now = new Date();
  const sessionExpiresAt = new Date(now.getTime() + STEP_UP_TOKEN_TTL_MINUTES * 60 * 1000);

  const stepUpToken = jwt.sign(
    {
      sub: userId,
      jti,
      aadhaarLast4: record.aadhaar_last4,
      verificationId: record.id,
      type: 'stepup',
    },
    config.jwt.accessSecret,
    {
      issuer: STEP_UP_ISSUER,
      audience: STEP_UP_AUDIENCE,
      expiresIn: `${STEP_UP_TOKEN_TTL_MINUTES}m`,
      algorithm: 'HS256',
    }
  );

  await record.update({
    status: 'verified',
    verified_at: now,
    session_token_jti: jti,
    session_expires_at: sessionExpiresAt,
    otp_code_hash: null, // clear OTP hash after success
  });

  return {
    stepUpToken,
    expiresAt: sessionExpiresAt.toISOString(),
    expiresInSeconds: STEP_UP_TOKEN_TTL_MINUTES * 60,
    aadhaarLast4: record.aadhaar_last4,
  };
};

/**
 * Validate a step-up token (used by middleware)
 * @param {string} token
 * @param {number} userId
 * @returns {object} decoded payload
 */
const validateStepUpToken = (token, userId) => {
  if (!token) {
    const err = new Error('Aadhaar verification required');
    err.statusCode = 403;
    err.errorCode = 'AADHAAR_STEPUP_REQUIRED';
    throw err;
  }

  let decoded;
  try {
    decoded = jwt.verify(token, config.jwt.accessSecret, {
      issuer: STEP_UP_ISSUER,
      audience: STEP_UP_AUDIENCE,
      algorithms: ['HS256'],
    });
  } catch (e) {
    const err = new Error(
      e.name === 'TokenExpiredError' ? 'Aadhaar session expired' : 'Invalid Aadhaar session'
    );
    err.statusCode = 403;
    err.errorCode = e.name === 'TokenExpiredError' ? 'AADHAAR_STEPUP_EXPIRED' : 'AADHAAR_STEPUP_INVALID';
    throw err;
  }

  if (decoded.type !== 'stepup' || decoded.sub !== userId) {
    const err = new Error('Aadhaar session does not match user');
    err.statusCode = 403;
    err.errorCode = 'AADHAAR_STEPUP_USER_MISMATCH';
    throw err;
  }

  return decoded;
};

/**
 * Check current step-up status for a user (for UI hints)
 */
const getStepUpStatus = async (userId) => {
  const latest = await AadhaarVerification.findOne({
    where: {
      user_id: userId,
      status: 'verified',
      session_expires_at: { [Op.gt]: new Date() },
    },
    order: [['verified_at', 'DESC']],
  });

  if (!latest) return { verified: false };

  const expiresAt = new Date(latest.session_expires_at);
  return {
    verified: true,
    aadhaarLast4: latest.aadhaar_last4,
    expiresAt: expiresAt.toISOString(),
    expiresInSeconds: Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000)),
  };
};

/**
 * Revoke step-up session (used on logout)
 */
const revokeStepUp = async (userId) => {
  await AadhaarVerification.update(
    { status: 'revoked', session_expires_at: new Date() },
    { where: { user_id: userId, status: 'verified' } }
  );
};

module.exports = {
  initiateAadhaarOtp,
  verifyAadhaarOtp,
  validateStepUpToken,
  getStepUpStatus,
  revokeStepUp,
  STEP_UP_TOKEN_TTL_MINUTES,
};
