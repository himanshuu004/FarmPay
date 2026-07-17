/**
 * Auth Controller
 * Handles HTTP requests for authentication endpoints.
 * Delegates business logic to authService and formats responses.
 */

const authService = require('../services/authService');
const aadhaarAuthService = require('../services/aadhaarAuthService');
const { success, error } = require('../../../shared/utils/responseHelper');
const STATUS_CODES = require('../../../shared/constants/statusCodes');
const logger = require('../../../shared/utils/logger');
const { User } = require('../../../shared/models');

// Resolves req.user.id (business user_id string) to internal integer PK.
const resolveInternalUserId = async (req) => {
  // If authenticate middleware already provided the numeric id, use it
  if (req.user && typeof req.user.id === 'number') return req.user.id;
  const user = await User.findOne({ where: { user_id: req.user.id, is_active: true } });
  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 404;
    err.errorCode = 'RES_001';
    throw err;
  }
  return user.id;
};

/**
 * POST /auth/register
 * Registers a new user and sends OTP for mobile verification.
 */
const register = async (req, res, next) => {
  try {
    const result = await authService.register(req.body);

    logger.info(`Registration initiated: ${result.userId}`, { requestId: req.requestId });

    return success(res, {
      message: 'Registration successful. OTP sent to your mobile number',
      data: {
        userId: result.userId,
        otpRequestId: result.otpRequestId,
        expiresInSeconds: result.expiresInSeconds,
      },
      statusCode: STATUS_CODES.CREATED,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /auth/set-mpin
 * Sets (or resets) the user's 4-digit MPIN after OTP verification.
 */
const setMpin = async (req, res, next) => {
  try {
    const result = await authService.setMpin(req.body);
    logger.info(`MPIN set for mobile: ${req.body.mobile}`, { requestId: req.requestId });
    return success(res, {
      message: result.message,
      data: { message: result.message },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /auth/send-otp
 * Sends an OTP to the specified mobile or email.
 */
const sendOtp = async (req, res, next) => {
  try {
    const result = await authService.sendOtp(req.body);

    return success(res, {
      message: 'OTP sent successfully',
      data: {
        otpRequestId: result.otpRequestId,
        expiresInSeconds: result.expiresInSeconds,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /auth/verify-otp
 * Verifies an OTP code.
 */
const verifyOtp = async (req, res, next) => {
  try {
    const result = await authService.verifyOtp(req.body);

    return success(res, {
      message: result.message,
      data: { verified: result.verified },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /auth/change-mpin (authenticated)
 * Logged-in user changes their MPIN.
 */
const changeMpin = async (req, res, next) => {
  try {
    const rawToken = req.headers.authorization?.split(' ')[1];
    const result = await authService.changeMpin(req.user.id, req.body, rawToken);
    logger.info(`MPIN changed: ${req.user.id}`, { requestId: req.requestId });
    return success(res, {
      message: result.message,
      data: { message: result.message },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /auth/login
 * Authenticates a user with mobile/email + password.
 */
const login = async (req, res, next) => {
  try {
    const meta = {
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
    };

    const result = await authService.login(req.body, meta);

    logger.info(`Login successful: ${result.user.userId}`, { requestId: req.requestId });

    return success(res, {
      message: 'Login successful',
      data: {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        user: result.user,
        expiresIn: result.expiresIn,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /auth/refresh-token
 * Issues a new access token from a valid refresh token.
 */
const refreshToken = async (req, res, next) => {
  try {
    const result = await authService.refreshAccessToken(req.body.refreshToken);

    return success(res, {
      message: 'Token refreshed successfully',
      data: {
        accessToken: result.accessToken,
        expiresIn: result.expiresIn,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /auth/logout
 * Invalidates the current session.
 */
const logout = async (req, res, next) => {
  try {
    // Extract raw token from Authorization header
    const rawToken = req.headers.authorization?.split(' ')[1];
    const result = await authService.logout(req.user.id, rawToken);

    logger.info(`Logout: ${req.user.id}`, { requestId: req.requestId });

    return success(res, {
      message: result.message,
      data: { message: result.message },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /auth/forgot-mpin
 * Initiates an MPIN reset by sending an OTP. Client then calls /auth/set-mpin.
 */
const forgotMpin = async (req, res, next) => {
  try {
    const result = await authService.forgotMpin(req.body);

    return success(res, {
      message: 'If an account exists, an OTP has been sent',
      data: {
        otpRequestId: result.otpRequestId,
        expiresInSeconds: result.expiresInSeconds,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /auth/me
 * Returns the authenticated user's profile, roles, and permissions.
 */
const getMe = async (req, res, next) => {
  try {
    const result = await authService.getMe(req.user.id);

    return success(res, {
      message: 'Profile retrieved successfully',
      data: result,
    });
  } catch (err) {
    next(err);
  }
};

// ─── Tier-2: Aadhaar Step-Up Authentication ────────────────────────

/**
 * POST /auth/aadhaar/send-otp
 * Initiates Aadhaar OTP flow for DICE financial operations.
 * Requires Tier-1 auth (req.user populated).
 */
const sendAadhaarOtp = async (req, res, next) => {
  try {
    const internalId = await resolveInternalUserId(req);
    const result = await aadhaarAuthService.initiateAadhaarOtp(
      internalId,
      req.body.aadhaar,
      {
        ipAddress: req.ip,
        deviceFingerprint: req.headers['user-agent'],
      }
    );
    logger.info(`Aadhaar OTP sent for user ${req.user.id}`, { requestId: req.requestId });
    return success(res, {
      message: 'OTP sent to Aadhaar-linked mobile number',
      data: result,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /auth/aadhaar/verify-otp
 * Verifies OTP and issues step-up session token (15-min TTL).
 */
const verifyAadhaarOtp = async (req, res, next) => {
  try {
    const internalId = await resolveInternalUserId(req);
    const result = await aadhaarAuthService.verifyAadhaarOtp(
      internalId,
      req.body.otpRequestId,
      req.body.otpCode
    );
    logger.info(`Aadhaar step-up issued for user ${req.user.id}`, { requestId: req.requestId });
    return success(res, {
      message: 'Aadhaar verified successfully',
      data: result,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /auth/aadhaar/status
 * Returns whether the user currently has a valid step-up session.
 */
const getAadhaarStatus = async (req, res, next) => {
  try {
    const internalId = await resolveInternalUserId(req);
    const result = await aadhaarAuthService.getStepUpStatus(internalId);
    return success(res, { message: 'Aadhaar status retrieved', data: result });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  register,
  sendOtp,
  verifyOtp,
  setMpin,
  changeMpin,
  login,
  refreshToken,
  logout,
  forgotMpin,
  getMe,
  sendAadhaarOtp,
  verifyAadhaarOtp,
  getAadhaarStatus,
};
