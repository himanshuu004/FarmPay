/**
 * Data Sensitivity Levels
 * Used for classifying data and controlling access/encryption requirements.
 */

const SENSITIVITY_LEVELS = {
  /** Publicly accessible data — no restrictions */
  PUBLIC: 'public',

  /** Internal use only — visible to authenticated platform users */
  INTERNAL: 'internal',

  /** Confidential — restricted to authorized roles, encrypted at rest */
  CONFIDENTIAL: 'confidential',

  /** Restricted — highest sensitivity (PII, financial), KMS-encrypted, audit-logged */
  RESTRICTED: 'restricted',
};

/**
 * Maps sensitivity levels to their encryption requirements.
 */
const ENCRYPTION_REQUIREMENTS = {
  [SENSITIVITY_LEVELS.PUBLIC]: { atRest: false, inTransit: true },
  [SENSITIVITY_LEVELS.INTERNAL]: { atRest: false, inTransit: true },
  [SENSITIVITY_LEVELS.CONFIDENTIAL]: { atRest: true, inTransit: true },
  [SENSITIVITY_LEVELS.RESTRICTED]: { atRest: true, inTransit: true, kmsRequired: true },
};

module.exports = { SENSITIVITY_LEVELS, ENCRYPTION_REQUIREMENTS };
