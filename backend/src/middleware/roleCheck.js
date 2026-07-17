/**
 * Role-Based Access Control Middleware
 * Restricts route access to users with specific roles.
 * Must be used AFTER the authenticate middleware.
 */

const { error } = require('../shared/utils/responseHelper');
const STATUS_CODES = require('../shared/constants/statusCodes');
const ERROR_CODES = require('../shared/constants/errorCodes');

/**
 * Creates middleware that allows only the specified roles.
 * @param {...string} allowedRoles - Role strings that are permitted
 * @returns {Function} Express middleware
 *
 * @example
 * router.get('/admin/users', authenticate, roleCheck('system_admin', 'super_admin'), listUsers);
 */
const roleCheck = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return error(res, {
        message: 'Authentication required',
        errorCode: ERROR_CODES.AUTH_TOKEN_MISSING,
        statusCode: STATUS_CODES.UNAUTHORIZED,
      });
    }

    const userRole = req.user.role;

    if (!allowedRoles.includes(userRole)) {
      return error(res, {
        message: 'You do not have permission to access this resource',
        errorCode: ERROR_CODES.AUTH_INSUFFICIENT_ROLE,
        statusCode: STATUS_CODES.FORBIDDEN,
      });
    }

    next();
  };
};

module.exports = roleCheck;
