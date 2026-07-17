/**
 * Evidence integrity (§7.3; CLAUDE.md #9, #11). Content-addressed, EXIF-preserved
 * claim evidence with the NLM 4-document checklist (never ask beyond the four).
 * Each add appends a hash-chained claim_event. Deterministic fraud rules only
 * (duplicate content_hash, missing tag); ML/CV is deferred.
 */
const crypto = require('crypto');
const { Op } = require('sequelize');
const { REQUIRED_CLAIM_DOCS, ALL_EVIDENCE_KINDS } = require('../constants/claimDocs');
const claimEvents = require('./claimEventService');

let db;
const getDb = () => { if (!db) db = require('../../../shared/models'); return db; };

const err = (msg, code, status = 400) => { const e = new Error(msg); e.statusCode = status; e.errorCode = code; return e; };
const HEX64 = /^[0-9a-f]{64}$/i;

/** The 4-doc checklist for a claim: which required docs are present / missing. */
const checklist = async (claimId) => {
  const { EvidenceFile } = getDb();
  const files = await EvidenceFile.findAll({ where: { claim_id: claimId, is_active: true } });
  const present = new Set(files.map((f) => f.kind));
  const missing = REQUIRED_CLAIM_DOCS.filter((k) => !present.has(k));
  return {
    required: REQUIRED_CLAIM_DOCS,
    present: REQUIRED_CLAIM_DOCS.filter((k) => present.has(k)),
    missing,
    complete: missing.length === 0,
  };
};

/**
 * Add a piece of evidence. Rejects unknown kinds (the 4-doc rule + supporting
 * set is the whole universe), enforces one-doc-per-kind, flags a content_hash
 * seen on another claim, and appends a hash-chained event.
 */
const addEvidence = async (claim, { kind, objectKey, contentHash, gpsLat = null, gpsLng = null, capturedAt = null, deviceMeta = null, uploadedOffline = false }) => {
  const database = getDb();
  const { EvidenceFile } = database;
  if (['SETTLED', 'REJECTED'].includes(claim.status)) throw err(`Cannot add evidence to a ${claim.status} claim`, 'CLAIMS_CLOSED');
  if (!ALL_EVIDENCE_KINDS.includes(kind)) throw err(`Unknown evidence kind ${kind}`, 'CLAIMS_EVIDENCE_KIND_INVALID');
  if (!HEX64.test(String(contentHash || ''))) throw err('content_hash must be a SHA-256 hex digest', 'CLAIMS_CONTENT_HASH_INVALID');
  if (!objectKey) throw err('object_key is required', 'CLAIMS_OBJECT_KEY_REQUIRED');

  const dup = await EvidenceFile.findOne({ where: { claim_id: claim.id, kind, is_active: true } });
  if (dup) throw err(`${kind} already provided for this claim`, 'CLAIMS_EVIDENCE_DUPLICATE_KIND', 409);

  // Deterministic fraud rule: the same bytes submitted against another claim.
  const seenElsewhere = await EvidenceFile.findOne({ where: { content_hash: contentHash, claim_id: { [Op.ne]: claim.id } } });

  return database.sequelize.transaction(async (t) => {
    const file = await EvidenceFile.create({
      evidence_uuid: crypto.randomUUID(), claim_id: claim.id, kind, object_key: objectKey,
      content_hash: contentHash, gps_lat: gpsLat, gps_lng: gpsLng, captured_at: capturedAt,
      device_meta: deviceMeta, uploaded_offline: uploadedOffline,
    }, { transaction: t });

    if (seenElsewhere) {
      const flags = { ...(claim.fraud_flags || {}), duplicate_content_hash: true };
      await claim.update({ fraud_flags: flags }, { transaction: t });
    }
    await claimEvents.append(claim.id, {
      eventType: 'evidence_added', actorRole: 'farmer',
      payload: { kind, evidenceUuid: file.evidence_uuid, contentHash, duplicateContentHash: !!seenElsewhere },
    }, t);
    return { file, duplicateContentHash: !!seenElsewhere };
  });
};

module.exports = { checklist, addEvidence };
