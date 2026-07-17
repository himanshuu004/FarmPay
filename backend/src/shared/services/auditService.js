/**
 * Audit Service
 * Async audit logging via RabbitMQ to avoid blocking requests.
 * Tracks CRUD operations with field-level changes and sensitivity levels.
 */

const config = require('../../config');
const logger = require('../utils/logger');
const { generateUUID } = require('../utils/uuidHelper');

let db;
const getDb = () => { if (!db) db = require('../models'); return db; };

/**
 * Sensitivity level mapping for entity types.
 */
const SENSITIVITY_MAP = {
  aadhaar: '4_identity',
  bank_account: '3_financial',
  loan: '3_financial',
  farmer_profile: '2_pii',
  user: '2_pii',
  document: '2_pii',
  default: '1_public',
};

/**
 * Determines the sensitivity level for an entity type.
 * @param {string} entityType
 * @returns {string}
 */
const getSensitivity = (entityType) => {
  const lower = (entityType || '').toLowerCase();
  for (const [key, level] of Object.entries(SENSITIVITY_MAP)) {
    if (lower.includes(key)) return level;
  }
  return SENSITIVITY_MAP.default;
};

/**
 * Logs an audit event. Tries to publish via RabbitMQ for async processing.
 * Falls back to direct DB insert if RabbitMQ is unavailable.
 * @param {Object} params
 * @param {string} params.entityType - e.g. 'user', 'farmer_profile', 'bank_account'
 * @param {number} [params.entityId] - ID of the affected entity
 * @param {string} params.action - create, read, update, delete, export, approve, reject
 * @param {number} [params.actionBy] - User who performed the action
 * @param {Object} [params.oldValues] - Values before the change
 * @param {Object} [params.newValues] - Values after the change
 * @param {string[]} [params.changedFields] - Names of fields that changed
 * @param {string} [params.ipAddress]
 * @param {string} [params.userAgent]
 * @param {string} [params.requestId] - Correlating request ID
 * @returns {Promise<void>}
 */
const logAudit = async ({ entityType, entityId, action, actionBy, oldValues, newValues, changedFields, ipAddress, userAgent, requestId }) => {
  const auditData = {
    audit_uuid: generateUUID(),
    entity_type: entityType,
    entity_id: entityId,
    action,
    action_by: actionBy,
    action_at: new Date(),
    changed_fields: changedFields || null,
    old_values: oldValues || null,
    new_values: newValues || null,
    ip_address: ipAddress,
    user_agent: userAgent,
    sensitivity_level: getSensitivity(entityType),
    request_id: requestId,
  };

  // Try async via RabbitMQ
  try {
    const { getChannel } = require('../../config/rabbitmq');
    const channel = await getChannel();
    if (channel) {
      channel.publish(config.rabbitmq.exchange, 'audit.log', Buffer.from(JSON.stringify(auditData)));
      return;
    }
  } catch (err) {
    logger.warn('RabbitMQ unavailable for audit, falling back to direct insert');
  }

  // Fallback: direct DB insert
  try {
    const { AuditLogV2 } = getDb();
    await AuditLogV2.create(auditData);
  } catch (err) {
    logger.error('Audit log failed:', err.message);
  }
};

/**
 * Creates detailed field-level audit trail entries.
 * @param {number} auditLogId - Parent audit log ID
 * @param {Object} oldValues - Previous field values
 * @param {Object} newValues - New field values
 */
const createAuditTrail = async (auditLogId, oldValues, newValues) => {
  const { AuditTrail } = getDb();

  const fields = new Set([...Object.keys(oldValues || {}), ...Object.keys(newValues || {})]);
  const trails = [];
  let seq = 1;

  for (const field of fields) {
    const oldVal = oldValues?.[field];
    const newVal = newValues?.[field];
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      trails.push({
        audit_log_id: auditLogId,
        change_sequence: seq++,
        field_name: field,
        old_value: oldVal != null ? String(oldVal) : null,
        new_value: newVal != null ? String(newVal) : null,
      });
    }
  }

  if (trails.length > 0) {
    await AuditTrail.bulkCreate(trails);
  }
};

/**
 * Logs an audit export event.
 * @param {Object} params
 * @param {number} params.exportedBy
 * @param {string} params.entityType
 * @param {Object} params.filterCriteria
 * @param {number} params.rowCount
 * @param {string} params.s3ExportKey
 */
const logExport = async ({ exportedBy, entityType, filterCriteria, rowCount, s3ExportKey }) => {
  const { AuditExportLog } = getDb();
  await AuditExportLog.create({
    exported_by: exportedBy,
    entity_type: entityType,
    filter_criteria: filterCriteria,
    row_count: rowCount,
    s3_export_key: s3ExportKey,
  });
};

module.exports = { logAudit, createAuditTrail, logExport, getSensitivity };
