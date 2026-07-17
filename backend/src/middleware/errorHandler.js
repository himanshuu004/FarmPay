/**
 * Global Error Handler Middleware
 * Catches all unhandled errors and sends a standardized JSON error response.
 * Must be registered LAST in the Express middleware chain.
 */

const logger = require('../shared/utils/logger');
const STATUS_CODES = require('../shared/constants/statusCodes');
const ERROR_CODES = require('../shared/constants/errorCodes');

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, _next) => {
  // Log full error with request context
  logger.error(`${err.message}`, {
    requestId: req.requestId,
    method: req.method,
    url: req.originalUrl,
    stack: err.stack,
    userId: req.user ? req.user.id : null,
  });

  // Sequelize validation error
  if (err.name === 'SequelizeValidationError' || err.name === 'SequelizeUniqueConstraintError') {
    const errors = err.errors
      ? err.errors.map((e) => ({ field: e.path, message: e.message }))
      : [];

    return res.status(STATUS_CODES.BAD_REQUEST).json({
      success: false,
      message: 'Validation error',
      errors,
      errorCode: ERROR_CODES.VALIDATION_FAILED,
    });
  }

  // JWT errors (catch-all for any that slip past auth middleware)
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return res.status(STATUS_CODES.UNAUTHORIZED).json({
      success: false,
      message: 'Authentication failed',
      errorCode: ERROR_CODES.AUTH_TOKEN_INVALID,
    });
  }

  // Multer file size error
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(STATUS_CODES.BAD_REQUEST).json({
      success: false,
      message: 'File size exceeds the allowed limit',
      errorCode: ERROR_CODES.FILE_TOO_LARGE,
    });
  }

  // Default: internal server error
  const statusCode = err.statusCode || STATUS_CODES.INTERNAL_SERVER_ERROR;
  const message =
    statusCode === STATUS_CODES.INTERNAL_SERVER_ERROR
      ? 'An unexpected error occurred'
      : err.message;

  return res.status(statusCode).json({
    success: false,
    message,
    errorCode: err.errorCode || ERROR_CODES.SERVER_INTERNAL_ERROR,
  });
};

module.exports = errorHandler;
