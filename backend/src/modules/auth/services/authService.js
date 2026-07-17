/**
 * Auth Service
 * Core business logic for authentication: register, login, OTP, sessions, password reset.
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const config = require('../../../config');
const logger = require('../../../shared/utils/logger');
const { hashPassword, comparePassword } = require('../../../shared/utils/encryptionHelper');
const { generateUUID } = require('../../../shared/utils/uuidHelper');
const { addMinutes, isExpired } = require('../../../shared/utils/dateHelper');
const { User, Role, Permission, UserRole, UserPermission, RolePermission, UserSession, OtpRequest, sequelize } = require('../../../shared/models');

// ─── Constants ────────────────────────────────────────────────────

const OTP_LENGTH = config.otp.length;
const OTP_EXPIRY_MINUTES = config.otp.expiryMinutes;
const OTP_MAX_ATTEMPTS = config.otp.maxAttempts;
const LOGIN_MAX_FAILURES = 5;
const LOGIN_LOCKOUT_MINUTES = 15;

// ─── Token Helpers ────────────────────────────────────────────────

/**
 * Generates a JWT access token.
 * @param {Object} user - User record
 * @param {string} roleName - Primary role name
 * @returns {string} Signed JWT
 */
const generateAccessToken = (user, roleName) => {
  return jwt.sign(
    { id: user.user_id, role: roleName, email: user.email, mobile: user.mobile },
    config.jwt.accessSecret,
    { expiresIn: config.jwt.accessExpiry, issuer: config.jwt.issuer }
  );
};

/**
 * Generates a JWT refresh token.
 * @param {Object} user - User record
 * @returns {string} Signed JWT
 */
const generateRefreshToken = (user) => {
  return jwt.sign(
    { id: user.user_id, type: 'refresh' },
    config.jwt.refreshSecret,
    { expiresIn: config.jwt.refreshExpiry, issuer: config.jwt.issuer }
  );
};

/**
 * Generates a random 6-digit OTP code.
 * @returns {string} OTP code string
 */
const generateOtpCode = () => {
  // In development, always return 123456 for easy testing
  if (process.env.NODE_ENV !== 'production') return '123456';
  return crypto.randomInt(100000, 999999).toString();
};

/**
 * Hashes a token/OTP using SHA-256 for storage.
 * @param {string} token - Raw token
 * @returns {string} Hex-encoded SHA-256 hash
 */
const hashToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

// ─── User Lookup Helpers ──────────────────────────────────────────

/**
 * Finds a user by mobile or email.
 * @param {Object} params
 * @param {string} [params.mobile] - Mobile number
 * @param {string} [params.email] - Email address
 * @returns {Promise<Object|null>} User record or null
 */
const findUserByIdentifier = async ({ mobile, email }) => {
  const where = {};
  if (mobile) where.mobile = mobile.startsWith('+91') ? mobile : `+91${mobile}`;
  else if (email) where.email = email.toLowerCase();
  return User.findOne({ where, include: [{ model: UserRole, as: 'userRoles', where: { is_active: true }, required: false, include: [{ model: Role, as: 'role' }] }] });
};

/**
 * Gets all permissions for a user (from roles + direct grants).
 * @param {number} userId - Internal user ID
 * @returns {Promise<string[]>} Array of permission codes
 */
const getUserPermissions = async (userId) => {
  // Get role-based permissions
  const userRoles = await UserRole.findAll({
    where: { user_id: userId, is_active: true },
    include: [{
      model: Role, as: 'role',
      include: [{
        model: RolePermission, as: 'rolePermissions',
        include: [{ model: Permission, as: 'permission', where: { is_active: true } }],
      }],
    }],
  });

  const rolePermissions = userRoles.flatMap((ur) =>
    (ur.role?.rolePermissions || []).map((rp) => rp.permission?.permission_code).filter(Boolean)
  );

  // Get direct user permissions
  const directPerms = await UserPermission.findAll({
    where: { user_id: userId, is_active: true },
    include: [{ model: Permission, as: 'permission', where: { is_active: true } }],
  });

  const directPermCodes = directPerms.map((up) => up.permission?.permission_code).filter(Boolean);

  // Deduplicate
  return [...new Set([...rolePermissions, ...directPermCodes])];
};

// ─── Service Methods ──────────────────────────────────────────────

/**
 * Registers a new user and sends OTP for mobile verification.
 * @param {Object} data - Registration payload
 * @returns {Promise<Object>} { userId, otpRequestId, expiresInSeconds }
 */
const register = async (data) => {
  const { firstName, lastName, mobile, email, dateOfBirth, gender } = data;
  const formattedMobile = mobile.startsWith('+91') ? mobile : `+91${mobile}`;

  // Check for existing user
  const existingUser = await User.findOne({
    where: {
      [Op.or]: [
        { mobile: formattedMobile },
        ...(email ? [{ email: email.toLowerCase() }] : []),
      ],
    },
  });

  if (existingUser) {
    const field = existingUser.mobile === formattedMobile ? 'Mobile number' : 'Email';
    const err = new Error(`${field} is already registered`);
    err.statusCode = 409;
    err.errorCode = 'RES_002';
    throw err;
  }

  const transaction = await sequelize.transaction();

  try {
    // Create user (no password/mpin yet — MPIN is set after OTP verify)
    const user = await User.create({
      user_id: generateUUID(),
      email: email ? email.toLowerCase() : null,
      mobile: formattedMobile,
      password_hash: null,
      mpin_hash: null,
      first_name: firstName,
      last_name: lastName || null,
      date_of_birth: dateOfBirth || null,
      gender: gender || null,
    }, { transaction });

    // Assign default FARMER role
    const farmerRole = await Role.findOne({ where: { role_name: 'FARMER' } });
    if (farmerRole) {
      await UserRole.create({
        user_id: user.id,
        role_id: farmerRole.id,
        assigned_at: new Date(),
      }, { transaction });
    }

    // Generate and store OTP for mobile verification
    const otpCode = generateOtpCode();
    const otpRequestId = generateUUID();
    const expiresAt = addMinutes(new Date(), OTP_EXPIRY_MINUTES);

    await OtpRequest.create({
      otp_request_id: otpRequestId,
      mobile: formattedMobile,
      otp_code: hashToken(otpCode),
      purpose: 'register',
      sent_via: 'sms',
      expires_at: expiresAt,
      request_timestamp: new Date(),
    }, { transaction });

    await transaction.commit();

    // Send OTP (non-blocking — don't let SMS failure block registration)
    try {
      const { sendOTP } = require('../../../shared/services/smsService');
      await sendOTP(formattedMobile, otpCode);
    } catch (smsErr) {
      logger.error('Failed to send registration OTP SMS:', smsErr.message);
    }

    logger.info(`User registered: ${user.user_id}, mobile: ${formattedMobile}`);
    if (process.env.NODE_ENV !== 'production' || process.env.SHOW_DEV_OTP === 'true') {
      logger.info(`[DEV] OTP for ${formattedMobile} (register): ${otpCode}`);
    }

    return {
      userId: user.user_id,
      otpRequestId,
      expiresInSeconds: OTP_EXPIRY_MINUTES * 60,
      // Pilot-only: no SMS provider is wired up, so surface the OTP directly
      // in the response behind an explicit opt-in flag (never on by default)
      // rather than requiring log access. Same pattern as aadhaarAuthService's
      // demoOtp field.
      ...(process.env.SHOW_DEV_OTP === 'true' && { devOtp: otpCode }),
    };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
};

/**
 * Sends an OTP to the specified mobile or email.
 * @param {Object} data - { mobile, email, purpose }
 * @returns {Promise<Object>} { otpRequestId, expiresInSeconds }
 */
const sendOtp = async (data) => {
  const { mobile, email, purpose } = data;
  const formattedMobile = mobile ? (mobile.startsWith('+91') ? mobile : `+91${mobile}`) : null;

  // For login/reset_mpin, user must exist
  if (['login', 'reset_mpin'].includes(purpose)) {
    const user = await findUserByIdentifier({ mobile: formattedMobile, email });
    if (!user) {
      const err = new Error('No account found with this identifier');
      err.statusCode = 404;
      err.errorCode = 'RES_001';
      throw err;
    }
  }

  // Rate check: max 3 OTPs per identifier per 10 minutes
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
  const recentCount = await OtpRequest.count({
    where: {
      ...(formattedMobile ? { mobile: formattedMobile } : { email: email.toLowerCase() }),
      purpose,
      created_at: { [Op.gte]: tenMinutesAgo },
    },
  });

  const otpMaxAttempts = process.env.NODE_ENV !== 'production' ? 100 : 3;
  if (recentCount >= otpMaxAttempts) {
    const err = new Error('Too many OTP requests. Please try again later');
    err.statusCode = 429;
    err.errorCode = 'RATE_001';
    throw err;
  }

  const otpCode = generateOtpCode();
  const otpRequestId = generateUUID();
  const expiresAt = addMinutes(new Date(), OTP_EXPIRY_MINUTES);
  const sentVia = formattedMobile ? 'sms' : 'email';

  await OtpRequest.create({
    otp_request_id: otpRequestId,
    mobile: formattedMobile,
    email: email ? email.toLowerCase() : null,
    otp_code: hashToken(otpCode),
    purpose,
    sent_via: sentVia,
    expires_at: expiresAt,
    request_timestamp: new Date(),
  });

  // Send OTP
  try {
    if (formattedMobile) {
      const { sendOTP } = require('../../../shared/services/smsService');
      await sendOTP(formattedMobile, otpCode);
    } else {
      const { sendEmail } = require('../../../shared/services/emailService');
      await sendEmail({
        to: email,
        subject: `FarmerPay OTP: ${otpCode}`,
        text: `Your FarmerPay OTP is ${otpCode}. Valid for ${OTP_EXPIRY_MINUTES} minutes.`,
      });
    }
  } catch (sendErr) {
    logger.error(`Failed to send OTP via ${sentVia}:`, sendErr.message);
  }

  logger.info(`OTP sent for ${purpose} to ${formattedMobile || email}`);
  if (process.env.NODE_ENV !== 'production' || process.env.SHOW_DEV_OTP === 'true') {
    logger.info(`[DEV] OTP for ${formattedMobile || email} (${purpose}): ${otpCode}`);
  }

  return {
    otpRequestId,
    expiresInSeconds: OTP_EXPIRY_MINUTES * 60,
    ...(process.env.SHOW_DEV_OTP === 'true' && { devOtp: otpCode }),
  };
};

/**
 * Verifies an OTP code against the stored request.
 * @param {Object} data - { otpRequestId, otpCode }
 * @returns {Promise<Object>} { verified, message }
 */
const verifyOtp = async (data) => {
  const { otpRequestId, otpCode } = data;

  const otpRequest = await OtpRequest.findOne({
    where: { otp_request_id: otpRequestId },
  });

  if (!otpRequest) {
    const err = new Error('Invalid OTP request');
    err.statusCode = 400;
    err.errorCode = 'AUTH_007';
    throw err;
  }

  // Check expiry
  if (isExpired(otpRequest.expires_at)) {
    const err = new Error('OTP has expired');
    err.statusCode = 400;
    err.errorCode = 'AUTH_008';
    throw err;
  }

  // Check already verified
  if (otpRequest.verified_at) {
    const err = new Error('OTP has already been verified');
    err.statusCode = 400;
    err.errorCode = 'AUTH_007';
    throw err;
  }

  // Atomically increment attempt count and check max attempts to prevent race conditions
  const [updatedCount] = await OtpRequest.update(
    { attempt_count: sequelize.literal('attempt_count + 1') },
    { where: { id: otpRequest.id, attempt_count: { [Op.lt]: otpRequest.max_attempts } } }
  );

  if (updatedCount === 0) {
    const err = new Error('Maximum OTP attempts exceeded');
    err.statusCode = 429;
    err.errorCode = 'AUTH_009';
    throw err;
  }

  // Verify OTP hash using timing-safe comparison to prevent timing attacks
  const hashedInput = hashToken(otpCode);
  const storedHash = otpRequest.otp_code;
  const inputBuffer = Buffer.from(hashedInput, 'hex');
  const storedBuffer = Buffer.from(storedHash, 'hex');
  if (inputBuffer.length !== storedBuffer.length || !crypto.timingSafeEqual(inputBuffer, storedBuffer)) {
    const remaining = otpRequest.max_attempts - otpRequest.attempt_count - 1;
    const err = new Error(`Invalid OTP code. ${remaining} attempts remaining`);
    err.statusCode = 400;
    err.errorCode = 'AUTH_007';
    throw err;
  }

  // Mark as verified
  await otpRequest.update({ verified_at: new Date() });

  // If purpose is register, mark mobile as verified
  if (otpRequest.purpose === 'register' && otpRequest.mobile) {
    await User.update(
      { is_mobile_verified: true },
      { where: { mobile: otpRequest.mobile } }
    );
  }

  logger.info(`OTP verified: ${otpRequestId}, purpose: ${otpRequest.purpose}`);

  return { verified: true, message: 'OTP verified successfully' };
};

/**
 * Sets or resets the user's MPIN.
 * Requires a recently-verified OTP for the same mobile (register or reset_mpin purpose).
 * @param {Object} data - { mobile, otpRequestId, mpin }
 * @returns {Promise<Object>} { message }
 */
const setMpin = async (data) => {
  const { mobile, otpRequestId, mpin } = data;
  const formattedMobile = mobile.startsWith('+91') ? mobile : `+91${mobile}`;

  // Validate the OTP was verified, matches this mobile, and is for register/reset_mpin
  const otpRequest = await OtpRequest.findOne({ where: { otp_request_id: otpRequestId } });
  if (!otpRequest || otpRequest.mobile !== formattedMobile) {
    const err = new Error('Invalid OTP request');
    err.statusCode = 400;
    err.errorCode = 'AUTH_007';
    throw err;
  }
  if (!otpRequest.verified_at) {
    const err = new Error('OTP not yet verified');
    err.statusCode = 400;
    err.errorCode = 'AUTH_007';
    throw err;
  }
  if (!['register', 'reset_mpin'].includes(otpRequest.purpose)) {
    const err = new Error('OTP was not issued for MPIN setup');
    err.statusCode = 400;
    err.errorCode = 'AUTH_007';
    throw err;
  }
  // Verified OTP must be recent — reject if older than 15 minutes to prevent reuse
  const verifiedAgeMs = Date.now() - new Date(otpRequest.verified_at).getTime();
  if (verifiedAgeMs > 15 * 60 * 1000) {
    const err = new Error('Verification expired. Please request a new OTP');
    err.statusCode = 400;
    err.errorCode = 'AUTH_008';
    throw err;
  }

  const user = await User.findOne({ where: { mobile: formattedMobile } });
  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 404;
    err.errorCode = 'RES_001';
    throw err;
  }

  const mpinHash = await hashPassword(mpin);
  await user.update({
    mpin_hash: mpinHash,
    is_mobile_verified: true,
    failed_login_attempts: 0,
    account_locked_until: null,
  });

  // Consume the OTP so it can't be reused for another MPIN set.
  // `purpose` is an ENUM, so instead of mutating it we delete the record.
  await otpRequest.destroy();

  logger.info(`MPIN set for user: ${user.user_id}`);
  return { message: 'MPIN set successfully' };
};

/**
 * Changes a logged-in user's MPIN.
 * Verifies the current MPIN before updating. Invalidates all other sessions.
 * @param {string} userUuid - User UUID from JWT (req.user.id)
 * @param {Object} data - { currentMpin, newMpin }
 * @param {string} [currentAccessToken] - raw access token to preserve the
 *   caller's own session while invalidating others
 * @returns {Promise<Object>} { message }
 */
const changeMpin = async (userUuid, data, currentAccessToken) => {
  const { currentMpin, newMpin } = data;

  const user = await User.findOne({ where: { user_id: userUuid, is_active: true } });
  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 404;
    err.errorCode = 'RES_001';
    throw err;
  }

  if (!user.mpin_hash) {
    const err = new Error('MPIN not set. Please use forgot-mpin to set one');
    err.statusCode = 400;
    err.errorCode = 'AUTH_010';
    throw err;
  }

  // Check account lockout
  if (user.account_locked_until && !isExpired(user.account_locked_until)) {
    const err = new Error('Account is temporarily locked. Please try again later');
    err.statusCode = 423;
    err.errorCode = 'AUTH_006';
    throw err;
  }

  // Verify current MPIN
  const isMatch = await comparePassword(currentMpin, user.mpin_hash);
  if (!isMatch) {
    const newFailCount = user.failed_login_attempts + 1;
    const updateData = { failed_login_attempts: newFailCount };
    if (newFailCount >= LOGIN_MAX_FAILURES) {
      updateData.account_locked_until = addMinutes(new Date(), LOGIN_LOCKOUT_MINUTES);
      logger.warn(`Account locked for user ${user.user_id} after ${newFailCount} failed change-mpin attempts`);
    }
    await user.update(updateData);

    const err = new Error('Current MPIN is incorrect');
    err.statusCode = 401;
    err.errorCode = 'AUTH_002';
    throw err;
  }

  // Update to new MPIN
  const newHash = await hashPassword(newMpin);
  await user.update({
    mpin_hash: newHash,
    failed_login_attempts: 0,
    account_locked_until: null,
  });

  // Invalidate all other active sessions (keep the caller's own session alive)
  const keepHash = currentAccessToken ? hashToken(currentAccessToken) : null;
  await UserSession.update(
    { is_active: false, logged_out_at: new Date() },
    {
      where: {
        user_id: user.id,
        is_active: true,
        ...(keepHash ? { session_token: { [Op.ne]: keepHash } } : {}),
      },
    }
  );

  logger.info(`MPIN changed for user: ${user.user_id}`);
  return { message: 'MPIN changed successfully' };
};

/**
 * Authenticates a user and creates a session.
 * @param {Object} data - { mobile, mpin, deviceInfo, deviceUuid }
 * @param {Object} meta - { ipAddress, userAgent }
 * @returns {Promise<Object>} { accessToken, refreshToken, user, expiresIn }
 */
const login = async (data, meta = {}) => {
  const { mobile, mpin, deviceInfo, deviceUuid } = data;
  const formattedMobile = mobile.startsWith('+91') ? mobile : `+91${mobile}`;

  const user = await findUserByIdentifier({ mobile: formattedMobile });

  if (!user || !user.is_active) {
    const err = new Error('Invalid credentials');
    err.statusCode = 401;
    err.errorCode = 'AUTH_002';
    throw err;
  }

  // User must have an MPIN set
  if (!user.mpin_hash) {
    const err = new Error('MPIN not set. Please complete registration via OTP');
    err.statusCode = 401;
    err.errorCode = 'AUTH_010';
    throw err;
  }

  // Check account lockout
  if (user.account_locked_until && !isExpired(user.account_locked_until)) {
    const err = new Error('Account is temporarily locked. Please try again later');
    err.statusCode = 423;
    err.errorCode = 'AUTH_006';
    throw err;
  }

  // Verify MPIN
  const isMatch = await comparePassword(mpin, user.mpin_hash);

  if (!isMatch) {
    // Increment failed attempts
    const newFailCount = user.failed_login_attempts + 1;
    const updateData = { failed_login_attempts: newFailCount };

    // Lock account after max failures
    if (newFailCount >= LOGIN_MAX_FAILURES) {
      updateData.account_locked_until = addMinutes(new Date(), LOGIN_LOCKOUT_MINUTES);
      logger.warn(`Account locked for user ${user.user_id} after ${newFailCount} failed attempts`);
    }

    await user.update(updateData);

    const remaining = LOGIN_MAX_FAILURES - newFailCount;
    const message = remaining > 0
      ? `Invalid credentials. ${remaining} attempts remaining`
      : `Account locked for ${LOGIN_LOCKOUT_MINUTES} minutes`;

    const err = new Error(message);
    err.statusCode = 401;
    err.errorCode = 'AUTH_002';
    throw err;
  }

  // Successful login — reset failed attempts
  const roleName = user.userRoles?.[0]?.role?.role_name || 'FARMER';
  const accessToken = generateAccessToken(user, roleName);
  const refreshToken = generateRefreshToken(user);

  // Parse refresh expiry for session record
  const refreshExpiryMs = parseDuration(config.jwt.refreshExpiry);
  const sessionExpiresAt = new Date(Date.now() + refreshExpiryMs);

  // Create session
  await UserSession.create({
    user_id: user.id,
    session_token: hashToken(accessToken),
    refresh_token: hashToken(refreshToken),
    device_info: deviceInfo || null,
    device_uuid: deviceUuid || null,
    ip_address: meta.ipAddress || null,
    user_agent: meta.userAgent || null,
    expires_at: sessionExpiresAt,
  });

  // Update user login info
  await user.update({
    last_login: new Date(),
    failed_login_attempts: 0,
    account_locked_until: null,
  });

  logger.info(`User logged in: ${user.user_id}`);

  return {
    accessToken,
    refreshToken,
    user: {
      userId: user.user_id,
      firstName: user.first_name,
      lastName: user.last_name,
      email: user.email,
      mobile: user.mobile,
      role: roleName,
    },
    expiresIn: 1800, // 30 minutes in seconds
  };
};

/**
 * Refreshes an access token using a valid refresh token.
 * @param {string} refreshToken - The refresh token
 * @returns {Promise<Object>} { accessToken, expiresIn }
 */
const refreshAccessToken = async (refreshToken) => {
  let decoded;
  try {
    decoded = jwt.verify(refreshToken, config.jwt.refreshSecret, { issuer: config.jwt.issuer, algorithms: ['HS256'] });
  } catch {
    const err = new Error('Invalid or expired refresh token');
    err.statusCode = 401;
    err.errorCode = 'AUTH_004';
    throw err;
  }

  // Find active session
  const hashedRefresh = hashToken(refreshToken);
  const session = await UserSession.findOne({
    where: { refresh_token: hashedRefresh, is_active: true },
  });

  if (!session || isExpired(session.expires_at)) {
    const err = new Error('Session expired. Please login again');
    err.statusCode = 401;
    err.errorCode = 'AUTH_004';
    throw err;
  }

  // Find user and role
  const user = await User.findOne({
    where: { user_id: decoded.id, is_active: true },
    include: [{
      model: UserRole, as: 'userRoles', where: { is_active: true }, required: false,
      include: [{ model: Role, as: 'role' }],
    }],
  });

  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 401;
    err.errorCode = 'AUTH_002';
    throw err;
  }

  const roleName = user.userRoles?.[0]?.role?.role_name || 'FARMER';
  const newAccessToken = generateAccessToken(user, roleName);

  // Update session
  await session.update({
    session_token: hashToken(newAccessToken),
    refreshed_at: new Date(),
  });

  logger.info(`Token refreshed for user: ${user.user_id}`);

  return { accessToken: newAccessToken, expiresIn: 1800 };
};

/**
 * Logs out a user by invalidating the current session.
 * @param {string} userUuid - User UUID from JWT
 * @param {string} accessToken - Raw access token to identify the session
 * @returns {Promise<Object>} { message }
 */
const logout = async (userUuid, accessToken) => {
  const hashedToken = hashToken(accessToken);
  const session = await UserSession.findOne({
    where: { session_token: hashedToken, is_active: true },
  });

  if (session) {
    await session.update({ is_active: false, logged_out_at: new Date() });
  }

  logger.info(`User logged out: ${userUuid}`);

  return { message: 'Logged out successfully' };
};

/**
 * Initiates an MPIN reset by sending an OTP.
 * Thin wrapper over sendOtp — keeps the forgot-mpin UX endpoint explicit.
 * Returns success even if user doesn't exist (don't reveal enrollment).
 * @param {Object} data - { mobile }
 * @returns {Promise<Object>} { otpRequestId, expiresInSeconds }
 */
const forgotMpin = async (data) => {
  const { mobile } = data;
  const formattedMobile = mobile.startsWith('+91') ? mobile : `+91${mobile}`;

  const user = await User.findOne({ where: { mobile: formattedMobile } });
  if (!user) {
    // Don't reveal non-existence — return a fake OTP request id
    return { otpRequestId: generateUUID(), expiresInSeconds: OTP_EXPIRY_MINUTES * 60 };
  }

  return sendOtp({ mobile, purpose: 'reset_mpin' });
};

/**
 * Gets the current user's profile with roles and permissions.
 * @param {string} userUuid - User UUID from JWT
 * @returns {Promise<Object>} User profile with roles and permissions
 */
const getMe = async (userUuid) => {
  const user = await User.findOne({
    where: { user_id: userUuid, is_active: true },
    include: [{
      model: UserRole, as: 'userRoles', where: { is_active: true }, required: false,
      include: [{ model: Role, as: 'role', attributes: ['role_name', 'display_name'] }],
    }],
  });

  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 404;
    err.errorCode = 'RES_001';
    throw err;
  }

  const permissions = await getUserPermissions(user.id);
  const roles = user.userRoles.map((ur) => ur.role?.role_name).filter(Boolean);

  return {
    userId: user.user_id,
    email: user.email,
    mobile: user.mobile,
    firstName: user.first_name,
    lastName: user.last_name,
    profilePictureUrl: user.profile_picture_url,
    dateOfBirth: user.date_of_birth,
    gender: user.gender,
    isEmailVerified: user.is_email_verified,
    isMobileVerified: user.is_mobile_verified,
    roles,
    permissions,
    lastLogin: user.last_login,
    createdAt: user.created_at,
  };
};

// ─── Utility ──────────────────────────────────────────────────────

/**
 * Parses a duration string like '30m', '7d', '1h' to milliseconds.
 * @param {string} duration - Duration string
 * @returns {number} Milliseconds
 */
const parseDuration = (duration) => {
  const units = { s: 1000, m: 60 * 1000, h: 3600 * 1000, d: 86400 * 1000 };
  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) return 7 * 86400 * 1000; // default 7 days
  return parseInt(match[1], 10) * units[match[2]];
};

module.exports = {
  register,
  sendOtp,
  verifyOtp,
  setMpin,
  changeMpin,
  login,
  refreshAccessToken,
  logout,
  forgotMpin,
  getMe,
};
