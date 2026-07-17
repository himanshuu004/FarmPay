/**
 * requireAadhaarAuth Middleware
 *
 * Enforces Tier-2 Aadhaar step-up authentication for financial operations
 * (DICE module: loans, insurance, repayments, disbursement).
 *
 * Must be used AFTER `authenticate` middleware so req.user is populated.
 * Expects header: `x-aadhaar-token: <stepUpToken>`
 *
 * Response codes:
 *   403 AADHAAR_STEPUP_REQUIRED — token missing
 *   403 AADHAAR_STEPUP_EXPIRED — token expired (client should re-prompt)
 *   403 AADHAAR_STEPUP_INVALID — token tampered/malformed
 */

const { validateStepUpToken } = require('../modules/auth/services/aadhaarAuthService');
const { error } = require('../shared/utils/responseHelper');
const { User } = require('../shared/models');

const requireAadhaarAuth = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return error(res, {
        message: 'Tier-1 authentication required first',
        errorCode: 'AUTH_REQUIRED',
        statusCode: 401,
      });
    }

    // Resolve business user_id string → internal integer PK
    let internalId = typeof req.user.id === 'number' ? req.user.id : null;
    if (!internalId) {
      const user = await User.findOne({ where: { user_id: req.user.id, is_active: true } });
      if (!user) {
        return error(res, {
          message: 'User not found',
          errorCode: 'RES_001',
          statusCode: 404,
        });
      }
      internalId = user.id;
    }

    const stepUpToken = req.headers['x-aadhaar-token'] || req.headers['X-Aadhaar-Token'];
    const decoded = validateStepUpToken(stepUpToken, internalId);

    req.aadhaarStepUp = {
      verificationId: decoded.verificationId,
      aadhaarLast4: decoded.aadhaarLast4,
      jti: decoded.jti,
      exp: decoded.exp,
    };
    req.internalUserId = internalId;

    next();
  } catch (err) {
    return error(res, {
      message: err.message || 'Aadhaar step-up required',
      errorCode: err.errorCode || 'AADHAAR_STEPUP_REQUIRED',
      statusCode: err.statusCode || 403,
    });
  }
};

module.exports = requireAadhaarAuth;
