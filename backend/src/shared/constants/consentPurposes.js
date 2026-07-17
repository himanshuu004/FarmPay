/**
 * DPDP consent purpose taxonomy (AI-0a).
 *
 * Every data share is bound to ONE purpose, revocable independently. Critically
 * `model_improvement` is ITS OWN purpose (CLAUDE.md #17): no model may train on
 * data unless the farmer consented to model_improvement specifically — consent
 * to (say) lending never implies consent to training.
 */

const CONSENT_PURPOSES = Object.freeze({
  KYC: 'kyc',
  LENDING: 'lending',
  DATA_PROCESSING: 'data_processing',
  MARKETING: 'marketing',
  INSURANCE: 'insurance',
  COOP_DATA: 'coop_data',              // ERP milk/passbook sharing
  EVIDENCE_SHARING: 'evidence_sharing', // claim evidence to insurer/surveyor
  BIOMETRIC: 'biometric',              // muzzle-print gallery
  VOICE_DATA: 'voice_data',            // voice logging capture
  MODEL_IMPROVEMENT: 'model_improvement', // ← training. Its own purpose. Never implied.
});

const CONSENT_PURPOSE_VALUES = Object.freeze(Object.values(CONSENT_PURPOSES));

// Purposes that permit using data to train/improve models. ONLY this one.
const TRAINING_PURPOSES = Object.freeze([CONSENT_PURPOSES.MODEL_IMPROVEMENT]);

module.exports = { CONSENT_PURPOSES, CONSENT_PURPOSE_VALUES, TRAINING_PURPOSES };
