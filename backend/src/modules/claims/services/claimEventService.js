/**
 * Claim event hash-chain (§7.3) — the tamper-evident audit spine.
 *
 *   event_hash = SHA256(prev_hash + stableStringify(payload) + hashed_at_iso)
 *
 * append() links each event to the previous one; verifyChain() recomputes the
 * whole chain and reports the first break. Any edit/insert/delete of a row (even
 * a bulk UPDATE) is rejected by the model hooks AND surfaces here as a broken
 * hash — defence in depth.
 */
const crypto = require('crypto');

let db;
const getDb = () => { if (!db) db = require('../../../shared/models'); return db; };

const GENESIS = '0'.repeat(64);

// Deterministic serialisation so the hash is stable regardless of key order.
const stable = (v) => {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
};

const hashOf = (prevHash, payload, isoTs) => crypto.createHash('sha256').update(prevHash + stable(payload) + isoTs).digest('hex');

// Canonicalise to the JSON form JSONB actually stores (Dates → ISO strings,
// undefined dropped) so the hash computed at write matches the value read back.
const canonical = (v) => JSON.parse(JSON.stringify(v == null ? {} : v));

/** Append one hash-chained event to a claim (call inside the state-change txn). */
const append = async (claimId, { eventType, actorRole, actorId = null, payload = {} }, t = null) => {
  const { ClaimEvent } = getDb();
  const last = await ClaimEvent.findOne({ where: { claim_id: claimId }, order: [['id', 'DESC']], transaction: t });
  const prevHash = last ? last.event_hash : GENESIS;
  const hashedAt = new Date();
  const canon = canonical(payload);
  const eventHash = hashOf(prevHash, canon, hashedAt.toISOString());
  return ClaimEvent.create({
    claim_id: claimId, event_type: eventType, actor_role: actorRole, actor_id: actorId,
    payload: canon, prev_hash: prevHash, event_hash: eventHash, hashed_at: hashedAt,
  }, { transaction: t });
};

/** Recompute the whole chain for a claim; returns { ok, length, brokenAt }. */
const verifyChain = async (claimId) => {
  const { ClaimEvent } = getDb();
  const events = await ClaimEvent.findAll({ where: { claim_id: claimId }, order: [['id', 'ASC']] });
  let expectedPrev = GENESIS;
  for (const e of events) {
    if (e.prev_hash !== expectedPrev) return { ok: false, length: events.length, brokenAt: e.id, reason: 'prev_hash mismatch' };
    const recomputed = hashOf(e.prev_hash, e.payload, new Date(e.hashed_at).toISOString());
    if (recomputed !== e.event_hash) return { ok: false, length: events.length, brokenAt: e.id, reason: 'event_hash mismatch (tampered payload)' };
    expectedPrev = e.event_hash;
  }
  return { ok: true, length: events.length, brokenAt: null };
};

module.exports = { append, verifyChain, hashOf, stable, GENESIS };
