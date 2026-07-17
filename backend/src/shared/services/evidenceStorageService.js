/**
 * Evidence storage — local-disk, content-addressed persistence for KAVACH
 * enrolment photos and CLAIMS 4-document evidence. Uses evidenceConventions
 * (sha256 content-addressing, EXIF/GPS/device metadata preserved, bytes
 * stored EXACTLY as captured — never resized/recompressed, unlike the
 * lossy dairy-animal-photo pattern which is fine for cosmetic photos but
 * not for statutory evidence per CLAUDE.md Convention 9).
 *
 * S3 is the documented target (see s3Service.js) but has no configured
 * bucket/credentials on this pilot deployment; local disk is the same
 * pragmatic choice already made for dairy-animal-photos and CIA-adjacent
 * uploads, so evidence capture works end-to-end today instead of throwing
 * on every request.
 */
const fs = require('fs');
const path = require('path');
const { buildEvidenceDescriptor } = require('./evidenceConventions');

const UPLOAD_ROOT = path.join(process.cwd(), 'uploads');

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

/**
 * Persists raw evidence bytes under a content-addressed path and returns
 * the descriptor (contentHash, storageKey, size, mimeType) plus a
 * `relativePath` the caller can turn into an authenticated serve URL.
 * @param {Buffer} buffer raw captured bytes, unmodified
 * @param {object} meta { mimeType, capturedAt }
 */
const store = (buffer, meta = {}) => {
  const descriptor = buildEvidenceDescriptor(buffer, meta);
  const relativePath = descriptor.storageKey; // evidence/aa/bb/<hash>.<ext>
  const absPath = path.join(UPLOAD_ROOT, relativePath);
  ensureDir(path.dirname(absPath));
  if (!fs.existsSync(absPath)) fs.writeFileSync(absPath, buffer);
  return { ...descriptor, relativePath };
};

/** Resolves the absolute disk path for a previously-stored content hash. */
const resolvePath = (contentHash, mimeType) => {
  const ext = (mimeType && mimeType.split('/')[1]) || 'bin';
  return path.join(
    UPLOAD_ROOT,
    'evidence',
    contentHash.slice(0, 2),
    contentHash.slice(2, 4),
    `${contentHash}.${ext}`,
  );
};

module.exports = { store, resolvePath };
