/**
 * Synchronous field-level crypto for CIA at-rest PII/financial columns. Used by
 * Sequelize getters/setters so all read sites stay unchanged and the plaintext
 * never lands in the DB. AES-256-GCM via the shared encryptionHelper (iv:tag:cipher).
 *
 * Lives under utils/ (not models/) so the model loader — which scans models/*.js
 * as model factories — never tries to register it.
 *
 * Key: CIA_FIELD_ENCRYPTION_KEY (32-byte hex), falling back to the platform
 * BANK_ENCRYPTION_KEY (farmerService already uses it). Fail-closed: writes/reads
 * throw if no key is configured. decField() tolerates legacy plaintext so a
 * pre-encryption row still reads back during/after rollout.
 *
 * (We deliberately do NOT use kmsService here — it is async and cannot run inside a
 * synchronous getter; a future AWS-KMS envelope scheme is a service-layer refactor.)
 */
const { encrypt, decrypt } = require('../../../shared/utils/encryptionHelper');

const key = () => {
  const k = process.env.CIA_FIELD_ENCRYPTION_KEY || process.env.BANK_ENCRYPTION_KEY;
  if (!k) { const e = new Error('CIA_FIELD_ENCRYPTION_KEY not configured'); e.statusCode = 500; e.errorCode = 'CIA_ENC_KEY_MISSING'; throw e; }
  return k;
};

const encField = (v) => (v === null || v === undefined || v === '' ? v : encrypt(String(v), key()));

const decField = (v) => {
  if (v === null || v === undefined || v === '') return v;
  // Ciphertext is exactly iv:tag:cipher (3 hex parts). Anything else is legacy plaintext.
  if (typeof v !== 'string' || v.split(':').length !== 3) return v;
  try { return decrypt(v, key()); } catch (e) { return v; } // undecryptable → return as-is (fail-safe)
};

module.exports = { encField, decField };
