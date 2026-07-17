/**
 * Evidence conventions (AI-0a).
 *
 * Evidence (claim photos, PM images, muzzle bursts, receipts) is LOSSLESS and
 * content-addressed (CLAUDE.md #9, #24):
 *   - the storage key is derived from the bytes (sha256) → dedupe + tamper-evidence,
 *   - EXIF/GPS/device metadata is PRESERVED (never stripped),
 *   - re-compression is REJECTED (bytes must be the original capture).
 *
 * This module is the single place those rules are encoded so every module that
 * stores evidence does it identically.
 */
const crypto = require('crypto');

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/**
 * Build a content-addressed descriptor for a piece of evidence.
 * @param {Buffer} buffer raw captured bytes (NOT re-encoded)
 * @param {object} meta { mimeType, exif, gps:{lat,lng,accuracy}, device, capturedAt }
 */
const buildEvidenceDescriptor = (buffer, meta = {}) => {
  if (!Buffer.isBuffer(buffer)) {
    const e = new Error('evidence must be a raw Buffer'); e.errorCode = 'EVIDENCE_NOT_BUFFER'; throw e;
  }
  const contentHash = sha256(buffer);
  const ext = (meta.mimeType && meta.mimeType.split('/')[1]) || 'bin';
  return {
    contentHash,
    size: buffer.length,
    // Sharded content-addressed key: aa/bb/aabb…  (Indian-region S3 bucket).
    storageKey: `evidence/${contentHash.slice(0, 2)}/${contentHash.slice(2, 4)}/${contentHash}.${ext}`,
    mimeType: meta.mimeType || 'application/octet-stream',
    exif: meta.exif || null,      // preserved verbatim
    gps: meta.gps || null,        // preserved for PostGIS geo-checks
    device: meta.device || null,
    capturedAt: meta.capturedAt || null,
  };
};

/**
 * Guard: two byte streams claiming to be the same evidence must be identical.
 * Used to reject silent re-compression on re-upload.
 */
const assertNotRecompressed = (originalHash, buffer) => {
  if (sha256(buffer) !== originalHash) {
    const e = new Error('evidence bytes differ from original capture (re-compression rejected)');
    e.statusCode = 422; e.errorCode = 'EVIDENCE_RECOMPRESSED';
    throw e;
  }
};

module.exports = { sha256, buildEvidenceDescriptor, assertNotRecompressed };
