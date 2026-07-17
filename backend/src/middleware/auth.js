/**
 * Authentication Middleware
 * Verifies JWT access tokens from the Authorization header.
 * Attaches the decoded user payload to req.user on success.
 */

const jwt = require('jsonwebtoken');
const config = require('../config');
const { error } = require('../shared/utils/responseHelper');
const STATUS_CODES = require('../shared/constants/statusCodes');
const ERROR_CODES = require('../shared/constants/errorCodes');

/**
 * Middleware that requires a valid JWT access token.
 * Expects header: Authorization: Bearer <token>
 */
const authenticate = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return error(res, {
        message: 'Access token is required',
        errorCode: ERROR_CODES.AUTH_TOKEN_MISSING,
        statusCode: STATUS_CODES.UNAUTHORIZED,
      });
    }

    const token = authHeader.split(' ')[1];

    const decoded = jwt.verify(token, config.jwt.accessSecret, {
      issuer: config.jwt.issuer,
      algorithms: ['HS256'],
    });

    // Attach user info to the request
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return error(res, {
        message: 'Access token has expired',
        errorCode: ERROR_CODES.AUTH_TOKEN_EXPIRED,
        statusCode: STATUS_CODES.UNAUTHORIZED,
      });
    }

    return error(res, {
      message: 'Invalid access token',
      errorCode: ERROR_CODES.AUTH_TOKEN_INVALID,
      statusCode: STATUS_CODES.UNAUTHORIZED,
    });
  }
};

/**
 * Optional authentication — attaches user if token is present, but does not block.
 */
const optionalAuth = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      req.user = jwt.verify(token, config.jwt.accessSecret, {
        issuer: config.jwt.issuer,
        algorithms: ['HS256'],
      });
    }
  } catch {
    // Silently ignore invalid tokens on optional routes
    req.user = null;
  }
  next();
};

module.exports = { authenticate, optionalAuth };
