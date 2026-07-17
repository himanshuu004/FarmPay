/**
 * Validation Middleware Factory
 * Returns Express middleware that validates req.body / req.query / req.params
 * against a Joi schema. Sends a standardized error response on failure.
 */

const { error } = require('../shared/utils/responseHelper');
const STATUS_CODES = require('../shared/constants/statusCodes');
const ERROR_CODES = require('../shared/constants/errorCodes');

/**
 * Creates a validation middleware for the given Joi schema.
 * @param {import('joi').ObjectSchema} schema - Joi validation schema
 * @param {string} [source='body'] - Request property to validate ('body', 'query', 'params')
 * @returns {Function} Express middleware
 *
 * @example
 * const Joi = require('joi');
 * const loginSchema = Joi.object({ phone: Joi.string().required() });
 * router.post('/login', validate(loginSchema), loginController);
 */
const validate = (schema, source = 'body') => {
  return (req, res, next) => {
    const { error: validationError, value } = schema.validate(req[source], {
      abortEarly: false,   // Collect all errors, not just the first
      stripUnknown: true,  // Remove fields not in schema
      allowUnknown: false,
    });

    if (validationError) {
      const errors = validationError.details.map((detail) => ({
        field: detail.path.join('.'),
        message: detail.message.replace(/"/g, ''),
      }));

      return error(res, {
        message: 'Validation failed',
        errors,
        errorCode: ERROR_CODES.VALIDATION_FAILED,
        statusCode: STATUS_CODES.BAD_REQUEST,
      });
    }

    // Replace source with sanitized value
    req[source] = value;
    next();
  };
};

module.exports = validate;
