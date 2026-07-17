/**
 * UUID Helper
 * Generates UUID v4 identifiers for entities and request tracking.
 */

const { v4: uuidv4 } = require('uuid');

/**
 * Generates a new UUID v4.
 * @returns {string} UUID string (e.g. "550e8400-e29b-41d4-a716-446655440000")
 */
const generateUUID = () => {
  return uuidv4();
};

/**
 * Generates a prefixed ID for a specific entity type.
 * @param {string} prefix - Short prefix (e.g. "FRM", "TXN", "DOC")
 * @returns {string} Prefixed UUID (e.g. "FRM_550e8400-e29b-41d4-a716-446655440000")
 */
const generatePrefixedId = (prefix) => {
  return `${prefix}_${uuidv4()}`;
};

module.exports = { generateUUID, generatePrefixedId };
