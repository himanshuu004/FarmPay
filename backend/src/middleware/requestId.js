/**
 * Request ID Middleware
 * Attaches a unique X-Request-ID to every incoming request for tracing.
 * If the client sends one, it is reused; otherwise a new UUID is generated.
 */

const { generateUUID } = require('../shared/utils/uuidHelper');

const requestId = (req, res, next) => {
  const id = req.headers['x-request-id'] || generateUUID();
  req.requestId = id;
  res.setHeader('X-Request-ID', id);
  next();
};

module.exports = requestId;
