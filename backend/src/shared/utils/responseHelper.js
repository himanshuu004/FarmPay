/**
 * API Response Helper
 * Builds standardized success and error responses.
 *
 * Success: { success: true, message: "...", data: {...}, meta: { page, limit, total } }
 * Error:   { success: false, message: "...", errors: [...], errorCode: "..." }
 */

const STATUS_CODES = require('../constants/statusCodes');

/**
 * Sends a success response.
 * @param {import('express').Response} res - Express response object
 * @param {Object} options
 * @param {string} options.message - Human-readable success message
 * @param {*} [options.data] - Response payload
 * @param {Object} [options.meta] - Pagination metadata
 * @param {number} [options.statusCode=200] - HTTP status code
 */
const success = (res, { message, data = null, meta = null, statusCode = STATUS_CODES.OK }) => {
  const response = {
    success: true,
    message,
  };

  if (data !== null) response.data = data;
  if (meta !== null) response.meta = meta;

  return res.status(statusCode).json(response);
};

/**
 * Sends an error response.
 * @param {import('express').Response} res - Express response object
 * @param {Object} options
 * @param {string} options.message - Human-readable error message
 * @param {Array} [options.errors] - Detailed error list (e.g. validation errors)
 * @param {string} [options.errorCode] - Application error code (e.g. AUTH_001)
 * @param {number} [options.statusCode=500] - HTTP status code
 */
const error = (res, { message, errors = [], errorCode = null, statusCode = STATUS_CODES.INTERNAL_SERVER_ERROR }) => {
  const response = {
    success: false,
    message,
  };

  if (errors.length > 0) response.errors = errors;
  if (errorCode) response.errorCode = errorCode;

  return res.status(statusCode).json(response);
};

module.exports = { success, error };
