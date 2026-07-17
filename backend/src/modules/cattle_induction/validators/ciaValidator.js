/**
 * CIA Joi validators. Scheme parameters are config (never validated as code);
 * these guard the SHAPE of app-authored requests. Ear-tag regex and geo bounds
 * are enforced here AND re-validated server-side per Convention 25/32.
 */
const Joi = require('joi');

const appUuidParam = Joi.object({
  appUuid: Joi.string().uuid().required(),
});

const schemeVersionParam = Joi.object({
  schemeVersion: Joi.string().max(60).required(),
});

const expressInterestSchema = Joi.object({
  schemeVersion: Joi.string().max(40).required(),
  dcsRef: Joi.string().max(40).optional(), // derived from the farmer's membership if omitted
});

const createApplicationSchema = Joi.object({
  schemeVersion: Joi.string().max(40).required(),
  requestedCattleCount: Joi.number().integer().min(1).max(10).required(), // ceiling is config; hard cap guards abuse
  preferredBreed: Joi.string().max(60).optional(),
});

// DCS board decision (BODY). appUuid is a URL param, validated separately with
// appUuidParam — it must NOT live in this body schema. reason mandatory when NOT
// selected; resolution doc mandatory when selected (PRD Part 8/17).
const selectionSchema = Joi.object({
  decision: Joi.string().valid('SELECTED', 'NOT_SELECTED').required(),
  reason: Joi.string().max(500).when('decision', { is: 'NOT_SELECTED', then: Joi.required() }),
  resolutionDocRef: Joi.string().max(200).when('decision', { is: 'SELECTED', then: Joi.required() }),
});

// Farmer application draft body (ERP pre-fill fills the rest).
const uploadDocumentSchema = Joi.object({
  checklistKey: Joi.string().max(60).required(),
  docRef: Joi.string().max(200).required(),
  contentHash: Joi.string().length(64).required(),   // sha256 hex
  mimeType: Joi.string().max(60).optional(),
  captureMeta: Joi.object().optional(),              // EXIF/GPS/device, preserved lossless
});

// Bank batch generation (DUSS checker) — bank-wise packet over selected apps.
const batchSchema = Joi.object({
  bankRef: Joi.string().max(40).required(),
  applicationUuids: Joi.array().items(Joi.string().uuid()).min(1).required(),
});

// Bank sanction file (BANK_MAKER stages) — a decision row per application.
const sanctionFileSchema = Joi.object({
  batchUuid: Joi.string().uuid().required(),
  fileRef: Joi.string().max(200).required(),
  rows: Joi.array().min(1).items(Joi.object({
    applicationUuid: Joi.string().uuid().required(),
    outcome: Joi.string().valid('SANCTIONED', 'REJECTED').required(),
    sanctionedAmount: Joi.number().min(0).when('outcome', { is: 'SANCTIONED', then: Joi.required() }),
    loanAccount: Joi.string().max(34).when('outcome', { is: 'SANCTIONED', then: Joi.required() }),
    rejectReason: Joi.string().max(500).when('outcome', { is: 'REJECTED', then: Joi.required() }),
  })).required(),
});

// Bank sanction confirm (BANK_CHECKER) — apply a previously-staged file.
const sanctionConfirmSchema = Joi.object({
  fileRef: Joi.string().max(200).required(),
});

// CIA-2 subsidy transfer (DUSS/finance) — amount is computed from config; the
// officer supplies the bank transfer reference.
const subsidyTransferSchema = Joi.object({
  transferRef: Joi.string().max(60).required(),
  bankRef: Joi.string().max(40).optional(),
});

// CIA-2 EMI-deduction consent (farmer) — the tri-partite authorisation artefact.
const emiConsentSchema = Joi.object({
  authorisationRef: Joi.string().max(120).required(), // legal deed / e-sign ref
  bankRef: Joi.string().max(40).optional(),
  channel: Joi.string().valid('app', 'ivr', 'paper').optional(),
});

// CIA-2 EMI-schedule ingest (bank) — installment rows from the bank schedule.
const emiFileSchema = Joi.object({
  fileRef: Joi.string().max(200).required(),
  rows: Joi.array().min(1).items(Joi.object({
    applicationUuid: Joi.string().uuid().required(),
    installmentNo: Joi.number().integer().min(1).required(),
    emiDue: Joi.number().min(0).required(),
    dueDate: Joi.date().required(),
  })).required(),
});

// CIA-2 disbursement recording (bank) — rows from the disbursement statement.
const disbursementFileSchema = Joi.object({
  rows: Joi.array().min(1).items(Joi.object({
    applicationUuid: Joi.string().uuid().required(),
    loanAccount: Joi.string().max(34).required(),
    amount: Joi.number().min(0).required(),
    ref: Joi.string().max(60).required(),
  })).required(),
});

// Deficiency memo (DUSS maker) — itemised gaps returned to the farmer.
const deficiencySchema = Joi.object({
  items: Joi.array().items(Joi.string().max(200)).min(1).required(),
  remarks: Joi.string().max(1000).optional(),
});

// Return-for-correction (DCS/DUSS) — reason mandatory.
const returnSchema = Joi.object({
  reason: Joi.string().max(500).required(),
});

// Supervisor field verification — geo + live photos mandatory (live-capture only).
// Per the CIA state machine the supervisor decides APPROVED or RETURNED only
// (no supervisor-reject; Return, with a reason, is the mechanism).
const verificationSchema = Joi.object({
  result: Joi.string().valid('APPROVED', 'RETURNED').required(),
  remarks: Joi.string().max(1000).when('result', { is: 'RETURNED', then: Joi.required() }),
  shedGeo: Joi.object({ lat: Joi.number().min(-90).max(90).required(), lng: Joi.number().min(-180).max(180).required() }).required(),
  residenceGeo: Joi.object({ lat: Joi.number().min(-90).max(90).required(), lng: Joi.number().min(-180).max(180).required() }).required(),
  mediaRefs: Joi.array().items(Joi.string()).min(1).required(), // content-addressed, live-captured
  checks: Joi.object({
    identity_ok: Joi.boolean(), membership_ok: Joi.boolean(),
    milk_pouring_ok: Joi.boolean(), existing_cattle_note: Joi.string().max(500),
  }).optional(),
  capturedOffline: Joi.boolean().default(false),
});

// Vet examination / valuation / e-sign (CIA-3, VET). APPROVED requires fitness
// + e-sign; REJECTED requires remarks. Price ceiling/band are config (server-checked).
const vetExamSchema = Joi.object({
  result: Joi.string().valid('APPROVED', 'REJECTED').required(),
  remarks: Joi.string().max(1000).when('result', { is: 'REJECTED', then: Joi.required() }),
  bodyConditionScore: Joi.number().min(1).max(5).optional(),
  ageMonths: Joi.number().integer().min(0).optional(),
  mastitisScreening: Joi.string().max(24).optional(),
  pregnancyStatus: Joi.string().max(24).optional(),
  testMilking: Joi.number().min(0).optional(),
  dailyMilkYield: Joi.number().min(0).optional(),
  // PRD Part 7.3 health/valuation fields (optional — persisted on APPROVE).
  parity: Joi.number().integer().min(0).optional(),
  lactationNumber: Joi.number().integer().min(0).optional(),
  lastCalvingDate: Joi.date().max('now').optional(),
  expectedYield: Joi.number().min(0).optional(),
  hornCharacteristics: Joi.string().max(300).optional(),
  dentition: Joi.string().max(120).optional(),
  vaccinationHistory: Joi.array().items(Joi.object({ vaccine: Joi.string().max(60), date: Joi.date() })).optional(),
  dewormingHistory: Joi.array().items(Joi.object()).optional(),
  diseaseHistory: Joi.string().max(1000).optional(),
  reproductiveHistory: Joi.string().max(1000).optional(),
  pregnancyDiagnosis: Joi.string().max(24).optional(),
  estimatedMarketValue: Joi.number().min(0).when('result', { is: 'APPROVED', then: Joi.required() }),
  approvedPurchasePrice: Joi.number().min(0).when('result', { is: 'APPROVED', then: Joi.required() }),
  fitnessForTransport: Joi.boolean().when('result', { is: 'APPROVED', then: Joi.valid(true).required() }),
  esign: Joi.object({ vetReg: Joi.string().max(40).required() }).when('result', { is: 'APPROVED', then: Joi.required() }),
});

// Cattle-purchase capture (CIA-1 records evidence; CIA-3 enforces the gate).
const purchaseCaptureSchema = Joi.object({
  earTagNo: Joi.string().pattern(/^\d{12}$/).required(),          // Convention 32; registry-unique check server-side
  earTagPhotoRef: Joi.string().required(),
  species: Joi.string().max(40).required(),
  breed: Joi.string().max(60).required(),
  sex: Joi.string().valid('MALE', 'FEMALE').required(),
  purchaseGeo: Joi.object({ lat: Joi.number().min(-90).max(90).required(), lng: Joi.number().min(-180).max(180).required() }).required(),
  destinationGeo: Joi.object({ lat: Joi.number().min(-90).max(90), lng: Joi.number().min(-180).max(180) }).optional(),
  photoRefs: Joi.array().items(Joi.string()).min(1).required(),  // live-capture; perceptual-hashed server-side
  videoRef: Joi.string().optional(),
  seller: Joi.object({
    name: Joi.string().max(120).required(),
    idProofRef: Joi.string().required(),
    bankAccount: Joi.string().max(34).required(),                // penny-drop verify in CIA-3
    photoRef: Joi.string().required(),
    relationshipToBuyer: Joi.string().max(120).required(),       // circular-sale screen
  }).required(),
  transport: Joi.object({
    vehicleRegNo: Joi.string().max(16).required(),
    driverName: Joi.string().max(120).required(),
    billRef: Joi.string().required(),
    challanRef: Joi.string().required(),
  }).optional(),
});

// CIA-3 insurance (farmer). Transit before movement; cattle needs an effective date.
const transitInsuranceSchema = Joi.object({
  sumInsured: Joi.number().min(0).optional(),
  insurerRef: Joi.string().max(40).optional(),
});
const arrivalSchema = Joi.object({
  destinationGeo: Joi.object({ lat: Joi.number().min(-90).max(90).required(), lng: Joi.number().min(-180).max(180).required() }).optional(),
});
const cattleInsuranceSchema = Joi.object({
  effectiveDate: Joi.date().required(),        // server enforces >= arrival (no backdating)
  sumInsured: Joi.number().min(0).optional(),
  insurerRef: Joi.string().max(40).optional(),
});

// CIA-4 muzzle re-ID (field, shadow). animalKey lets the mock simulate the same
// animal (re-ID) vs a substitution; live derives the embedding from the photo.
const muzzleSchema = Joi.object({
  photoRef: Joi.string().max(200).required(),   // live muzzle burst
  animalKey: Joi.string().max(64).optional(),
});

// CIA-4 claim report (farmer) — death/loss intimation (delegates to KAVACH claims).
const claimReportSchema = Joi.object({
  deathDate: Joi.date().optional(),
  peril: Joi.string().max(80).optional(),
  sumClaimed: Joi.number().min(0).optional(),
});

// CIA-4 post-purchase inspection (field) — ear-tag re-confirm + asset existence.
const inspectionSchema = Joi.object({
  dueDay: Joi.number().valid(7, 30, 90).required(),
  earTagNo: Joi.string().pattern(/^\d{12}$/).required(),
  photoRefs: Joi.array().items(Joi.string()).min(1).required(),  // live re-capture
  healthy: Joi.boolean().optional(),
  milkYield: Joi.number().min(0).optional(),
});

// CIA-3 fraud-exception clear (UCDF reviewer) — reason mandatory (append-only).
const clearExceptionSchema = Joi.object({
  flag: Joi.string().max(40).required(),
  reason: Joi.string().max(500).required(),
});

const schemeConfigSchema = Joi.object({
  schemeVersion: Joi.string().max(40).required(),
  title: Joi.string().max(160).optional(),
  rulesJson: Joi.object().required(), // subsidy %, contribution %, ceilings, geo-fence, deadlines, SLA — all config
  docChecklist: Joi.array().items(Joi.object({
    key: Joi.string().max(60).required(),
    label: Joi.string().max(160).required(),
    required: Joi.string().valid('MANDATORY', 'OPTIONAL', 'CONDITIONAL').default('MANDATORY'),
    when: Joi.string().max(200).optional(),
  })).default([]),
});

// Grievance (CIA-1/2, PRD Part 14B). category is validated against the known set
// in the service; the schema keeps it a bounded string.
const grievanceUuidParam = Joi.object({ grievanceUuid: Joi.string().uuid().required() });
const raiseGrievanceSchema = Joi.object({
  category: Joi.string().max(60).required(),
  description: Joi.string().max(500).optional(),
  applicationUuid: Joi.string().uuid().optional(),
  purchaseUuid: Joi.string().uuid().optional(),
  channel: Joi.string().valid('app', 'voice', 'ivr', 'posp').optional(),
  priority: Joi.string().valid('low', 'med', 'high').optional(),
});
const grievanceTransitionSchema = Joi.object({
  toStatus: Joi.string().valid('ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'ESCALATED').required(),
  note: Joi.string().max(500).optional(),
});

// CIA-2 milk-account re-map (DUSS/UCDF) — farmer shifted society (PRD 2.4).
const remapMilkAccountSchema = Joi.object({
  newMilkAccountRef: Joi.string().max(40).required(),
  newDcsRef: Joi.string().max(40).optional(),
  reason: Joi.string().max(500).required(),
});

// CIA-2 EMI moratorium (DUSS/UCDF) — PRD Sec 7.5.
const setMoratoriumSchema = Joi.object({
  untilDate: Joi.date().required(),
  reason: Joi.string().max(500).required(),
});

// CIA-2 loan restructure (BANK_CHECKER) — the re-amortised schedule (PRD Sec 7.5).
const restructureLoanSchema = Joi.object({
  restructureRef: Joi.string().max(60).required(),
  reason: Joi.string().max(500).required(),
  rows: Joi.array().min(1).items(Joi.object({
    installmentNo: Joi.number().integer().min(1).required(),
    emiDue: Joi.number().min(0).required(),
    dueDate: Joi.date().required(),
  })).required(),
});

module.exports = {
  appUuidParam, schemeVersionParam, expressInterestSchema, createApplicationSchema, selectionSchema,
  uploadDocumentSchema, deficiencySchema, returnSchema, batchSchema,
  sanctionFileSchema, sanctionConfirmSchema, subsidyTransferSchema, disbursementFileSchema, emiFileSchema, emiConsentSchema,
  verificationSchema, vetExamSchema, purchaseCaptureSchema, schemeConfigSchema,
  transitInsuranceSchema, arrivalSchema, cattleInsuranceSchema, clearExceptionSchema, inspectionSchema, claimReportSchema, muzzleSchema,
  grievanceUuidParam, raiseGrievanceSchema, grievanceTransitionSchema,
  remapMilkAccountSchema, setMoratoriumSchema, restructureLoanSchema,
};
