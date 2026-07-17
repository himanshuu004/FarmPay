/**
 * NLM claim document checklist — EXACTLY four, never more (CLAUDE.md #11).
 * Config, not code (#5): the required set is data the service reads, so a scheme
 * change edits this list, not the lifecycle.
 */
const REQUIRED_CLAIM_DOCS = Object.freeze([
  'DEATH_INTIMATION',   // intimation of death (with date)
  'POSTMORTEM_REPORT',  // VCI-vet post-mortem / death certificate
  'EAR_TAG_PHOTO',      // 12-digit NDDB tag close-up on the carcass
  'CLAIM_FORM',         // signed claim form
]);

// Extra evidence the app MAY hold but which is NOT part of the 4-doc gate.
const SUPPORTING_EVIDENCE = Object.freeze(['LOSS_PHOTO', 'LIVENESS_VIDEO', 'CARCASS_PHOTO']);

const ALL_EVIDENCE_KINDS = Object.freeze([...REQUIRED_CLAIM_DOCS, ...SUPPORTING_EVIDENCE]);

module.exports = { REQUIRED_CLAIM_DOCS, SUPPORTING_EVIDENCE, ALL_EVIDENCE_KINDS };
