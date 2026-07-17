/**
 * Pagination Helper
 * Parses pagination params from the request and builds meta objects.
 */

/**
 * Parses page and limit from query string with defaults and bounds.
 * @param {Object} query - Express req.query
 * @param {number} [defaultLimit=20] - Default items per page
 * @param {number} [maxLimit=100] - Maximum allowed limit
 * @returns {{ page: number, limit: number, offset: number }}
 */
const parsePagination = (query, defaultLimit = 20, maxLimit = 100) => {
  let page = parseInt(query.page, 10) || 1;
  let limit = parseInt(query.limit, 10) || defaultLimit;

  // Clamp values
  if (page < 1) page = 1;
  if (limit < 1) limit = 1;
  if (limit > maxLimit) limit = maxLimit;

  const offset = (page - 1) * limit;

  return { page, limit, offset };
};

/**
 * Builds the meta object for paginated responses.
 * @param {number} page - Current page number
 * @param {number} limit - Items per page
 * @param {number} total - Total items matching the query
 * @returns {{ page: number, limit: number, total: number, totalPages: number }}
 */
const buildMeta = (page, limit, total) => {
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  };
};

module.exports = { parsePagination, buildMeta };
