/**
 * CIA (Cattle Induction) API client — the farmer application-entry flow.
 * Wraps the /api/v1/cattle-induction endpoints. Reads + one non-money POST (EOI),
 * so plain apiGet/apiPost (money-movement endpoints use the DICE step-up helpers).
 */
import { apiGet, apiPost, apiDicePost } from "./api";

export type CiaRules = {
  subsidyPct?: number;
  beneficiaryContributionPct?: number;
  loanComponentPct?: number;
  priceCeiling?: number;
  maxCattlePerBeneficiary?: number;
  minMembershipMonths?: number;
  minAvgMonthlyMilkValue?: number;
  insuranceRequired?: boolean;
  [k: string]: any;
};
export type CiaDoc = { key: string; label: string; required: "MANDATORY" | "OPTIONAL" | "CONDITIONAL" };
export type CiaScheme = {
  schemeVersion: string;
  title: string | null;
  rules: CiaRules;
  documentChecklist?: CiaDoc[];
  publishedAt?: string;
  likelyEligible?: boolean | null; // only on the list, per-scheme for this farmer
};
export type CiaCheck = { key: string; label: string; ok: boolean; detail: string; src: string };
export type CiaEligibility = {
  isMember: boolean;
  schemeVersion?: string;
  advisory?: boolean;
  likelyEligible: boolean | null;
  checks: CiaCheck[];
  reasons: string[];
};
export type CiaInterest = { applicationUuid: string; status: string; schemeVersion: string; eoiAt?: string };

const BASE = "/cattle-induction";

/** All schemes open at the member's society, each annotated with per-scheme eligibility. */
export async function listSchemes(): Promise<CiaScheme[]> {
  const r = await apiGet(`${BASE}/schemes`);
  return r?.success && Array.isArray(r.data) ? r.data : [];
}

export type CiaApp = { applicationUuid: string; status: string; schemeVersion: string; [k: string]: any };
/** Statuses where the farmer's application is awaiting their details (post-DCS-selection). */
export const FILLABLE_STATUSES = ["APPLICATION_PENDING", "DOCUMENTS_INCOMPLETE", "RETURNED_FOR_CORRECTION"];

/** The farmer's own applications (most recent first). */
export async function myApplications(): Promise<CiaApp[]> {
  const r = await apiGet(`${BASE}/applications`);
  return r?.success && Array.isArray(r.data) ? r.data : [];
}

export type CiaTimelineEvent = { eventType: string; at: string | null; status: string | null };
export type CiaStatus = {
  applicationUuid: string;
  status: string;
  asOf: string;
  nextStep: string | null;
  returnedFor: { reason: string } | null;
  financials?: {
    sanctionedAmount: number; subsidyAmount: number; farmerContribution: number;
    loanComponent: number; subsidyPct: number; beneficiaryContributionPct: number;
  } | null;
  subsidyTransfer?: { ref: string; amount: number; recordedAt: string } | null;
  disbursement?: { loanAccount: string; amount: number; ref: string; recordedAt: string } | null;
  purchaseUnlocked?: boolean;
  timeline: CiaTimelineEvent[];
};

/** Owner-scoped status + honest timeline (derived from the append-only domain_events outbox). */
export async function getStatus(appUuid: string): Promise<CiaStatus | null> {
  const r = await apiGet(`${BASE}/applications/${encodeURIComponent(appUuid)}/status`);
  return r?.success ? r.data : null;
}

/** One scheme's full detail (rules + document checklist). */
export async function getScheme(version: string): Promise<CiaScheme | null> {
  const r = await apiGet(`${BASE}/schemes/${encodeURIComponent(version)}`);
  return r?.success ? r.data : null;
}

/** Non-binding eligibility for a specific scheme (advisory — never a sanction). */
export async function checkEligibility(scheme?: string): Promise<CiaEligibility | null> {
  const q = scheme ? `?scheme=${encodeURIComponent(scheme)}` : "";
  const r = await apiGet(`${BASE}/eligibility${q}`);
  return r?.success ? r.data : null;
}

/** Express interest in a scheme → shared with the DCS secretary (society-mediated). */
export async function expressInterest(schemeVersion: string): Promise<CiaInterest | null> {
  const r = await apiPost(`${BASE}/interest`, { schemeVersion });
  return r?.success ? r.data : null;
}

export type CiaPrefill = { name?: string; mobile?: string; dcsRef?: string; bankAccount?: string; source?: string };
export type CiaDraft = {
  applicationUuid: string;
  status: string;
  schemeVersion: string;
  requestedCattleCount?: number;
  preferredBreed?: string;
  prefill: CiaPrefill | null;
  documentChecklist: CiaDoc[];
  documents: { captured: string[]; missingMandatory: string[] };
};
export type CiaResult<T> = { ok: boolean; data?: T; errorCode?: string; message?: string; missingMandatory?: string[] };

/**
 * Open (or continue) the farmer's fillable application — the row already exists from
 * EOI and becomes fillable after DCS selection. Returns ERP pre-fill + the document
 * checklist + current capture status. Persists requestedCattleCount / preferredBreed
 * when passed. 409 CIA_NO_FILLABLE_APP if the farmer hasn't been selected yet.
 */
export async function openDraft(body?: { requestedCattleCount?: number; preferredBreed?: string }): Promise<CiaResult<CiaDraft>> {
  const r = await apiPost(`${BASE}/applications`, body || {});
  if (r?.success) return { ok: true, data: r.data };
  return { ok: false, errorCode: r?.errorCode, message: r?.message };
}

/** Camera-first document upload (content-addressed, per checklist key; re-upload replaces). */
export async function uploadDoc(
  appUuid: string,
  doc: { checklistKey: string; docRef: string; contentHash: string; mimeType?: string; captureMeta?: any },
): Promise<CiaResult<{ checklistKey: string; missingMandatory: string[]; checklistComplete: boolean }>> {
  const r = await apiPost(`${BASE}/applications/${encodeURIComponent(appUuid)}/documents`, doc);
  if (r?.success) return { ok: true, data: r.data, missingMandatory: r.data?.missingMandatory };
  return { ok: false, errorCode: r?.errorCode, message: r?.message };
}

/** Submit ★ — blocked (422 CIA_CHECKLIST_INCOMPLETE) until every mandatory doc is present. */
export async function submitApplication(appUuid: string): Promise<CiaResult<{ status: string }>> {
  const r = await apiPost(`${BASE}/applications/${encodeURIComponent(appUuid)}/submit`, {});
  if (r?.success) return { ok: true, data: r.data };
  return { ok: false, errorCode: r?.errorCode, message: r?.message, missingMandatory: r?.details?.missingMandatory };
}

/** Deterministic 64-hex content-hash placeholder for a captured image (seeded by its URI).
 *  Real SHA-256 of the bytes + S3 upload land together as a follow-up; the backend stores
 *  but does not yet verify the hash, so this satisfies the contract for now. */
export function placeholderHash(seed: string): string {
  let h = 2166136261 >>> 0; // FNV-1a offset
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  let out = "";
  for (let i = 0; i < 64; i++) { h ^= (i * 0x9e3779b1) >>> 0; h = Math.imul(h ^ (h >>> 15), 0x85ebca77) >>> 0; out += (h & 0xf).toString(16); }
  return out;
}

/* ------------------------ guided cattle purchase --------------------------- */

export type CiaGeo = { lat: number; lng: number };
export type CiaPurchaseState = {
  applicationUuid: string;
  appStatus: string;
  purchasable: boolean;        // capture allowed (loan disbursed, nothing captured yet)
  captured: boolean;
  purchaseStatus: string | null; // fine-grained CiaPurchase sub-status
  farmerAcknowledged?: boolean;
  deliveredAt?: string | null;
  gate?: { vetCertified: boolean; transitInsured: boolean; cattleInsured: boolean };
  cattlePolicyNo?: string | null;
  sellerPaymentReachable?: boolean;
  animal?: { earTagNo: string; species: string; breed: string; approvedPurchasePrice: number | null } | null;
  seller?: { name: string; accountVerified: boolean } | null;
  loan?: { amount: number; loanAccount: string } | null;
};
export type CiaCaptureBody = {
  earTagNo: string; earTagPhotoRef: string;
  species: string; breed: string; sex: "MALE" | "FEMALE";
  purchaseGeo: CiaGeo; destinationGeo?: CiaGeo;
  photoRefs: string[]; videoRef?: string;
  seller: { name: string; idProofRef: string; bankAccount: string; photoRef: string; relationshipToBuyer: string };
  transport?: { vehicleRegNo: string; driverName: string; billRef: string; challanRef: string };
};

/** Resumable hub state — the fine-grained purchase sub-status the status timeline hides. */
export async function getPurchaseState(appUuid: string): Promise<CiaPurchaseState | null> {
  const r = await apiGet(`${BASE}/applications/${encodeURIComponent(appUuid)}/purchase`);
  return r?.success ? r.data : null;
}

/** ★ Capture all purchase evidence at once → PURCHASE_INITIATED (traceability chain). */
export async function capturePurchase(appUuid: string, body: CiaCaptureBody): Promise<CiaResult<any>> {
  const r = await apiPost(`${BASE}/applications/${encodeURIComponent(appUuid)}/purchase/capture`, body);
  if (r?.success) return { ok: true, data: r.data };
  return { ok: false, errorCode: r?.errorCode, message: r?.message };
}

/** ★ Transit policy (before movement) — PURCHASE_APPROVED → TRANSIT_IN_PROGRESS. */
export async function issueTransit(appUuid: string, body?: { sumInsured?: number }): Promise<CiaResult<any>> {
  const r = await apiPost(`${BASE}/applications/${encodeURIComponent(appUuid)}/insurance/transit`, body || {});
  if (r?.success) return { ok: true, data: r.data };
  return { ok: false, errorCode: r?.errorCode, message: r?.message };
}

/** ★ Confirm arrival at the farmer's shed — TRANSIT_IN_PROGRESS → CATTLE_DELIVERED. */
export async function confirmArrival(appUuid: string, body?: { destinationGeo?: CiaGeo }): Promise<CiaResult<any>> {
  const r = await apiPost(`${BASE}/applications/${encodeURIComponent(appUuid)}/insurance/arrival`, body || {});
  if (r?.success) return { ok: true, data: r.data };
  return { ok: false, errorCode: r?.errorCode, message: r?.message };
}

/** ★ Cattle policy (effective date ≥ arrival, no backdating) — CATTLE_DELIVERED → INSURANCE_PENDING. */
export async function issueCattle(appUuid: string, body: { effectiveDate: string; sumInsured?: number }): Promise<CiaResult<any>> {
  const r = await apiPost(`${BASE}/applications/${encodeURIComponent(appUuid)}/insurance/cattle`, body);
  if (r?.success) return { ok: true, data: r.data };
  return { ok: false, errorCode: r?.errorCode, message: r?.message };
}

/* --------------------- milk-payment EMI + consent -------------------------- */

export type CiaEmiInstallment = { installmentNo: number; dueDate?: string | null; emiDue: number; status: string };
export type CiaEmiLedgerRow = {
  installmentNo: number; emiDue: number; amountDeducted: number; amountRemitted: number; pending: number; status: string;
};
export type CiaEmi = {
  applicationUuid: string;
  loanAccount: string | null;
  milkAccountRef: string | null;
  mode: string;                 // "TRACK" | "INITIATE"
  consentOnFile: boolean;
  moratoriumUntil?: string | null;
  installments: number;
  outstanding: number;
  nextEmi: { installmentNo: number; amount: number } | null;
  schedule: CiaEmiInstallment[];
  ledger: CiaEmiLedgerRow[];
};

/** Milk-linked repayment view: schedule + reconciled ledger + deduction mode. */
export async function getEmi(appUuid: string): Promise<CiaEmi | null> {
  const r = await apiGet(`${BASE}/applications/${encodeURIComponent(appUuid)}/emi`);
  return r?.success ? r.data : null;
}

/**
 * ★ Record the tri-partite (farmer–society–bank) authorisation → flips TRACK → INITIATE.
 * Aadhaar step-up protected: apiDicePost throws StepUpRequiredError on 403 (the caller
 * routes to /aadhaar-verify). The exact legal wording is pending UCDF/legal — this records
 * the in-app authorisation artefact (Convention 33).
 */
export async function recordEmiConsent(appUuid: string, authorisationRef: string): Promise<CiaResult<{ emiMode: string }>> {
  const r = await apiDicePost(`${BASE}/applications/${encodeURIComponent(appUuid)}/emi/consent`, { authorisationRef, channel: "app" });
  if (r?.success) return { ok: true, data: r.data };
  return { ok: false, errorCode: r?.errorCode, message: r?.message };
}

/** ★ Revoke consent → flips INITIATE → TRACK. No step-up needed to withdraw. */
export async function revokeEmiConsent(appUuid: string): Promise<CiaResult<any>> {
  const r = await apiPost(`${BASE}/applications/${encodeURIComponent(appUuid)}/emi/consent/revoke`, {});
  if (r?.success) return { ok: true, data: r.data };
  return { ok: false, errorCode: r?.errorCode, message: r?.message };
}

/** No-dues certificate — available once the loan is closed. */
export async function getNoDues(appUuid: string): Promise<any | null> {
  const r = await apiGet(`${BASE}/applications/${encodeURIComponent(appUuid)}/emi/no-dues-certificate`);
  return r?.success ? r.data : null;
}

/* ----------------------------- cattle claim -------------------------------- */

export type CiaClaimDoc = { key?: string; label?: string; present?: boolean; uploaded?: boolean; complete?: boolean };
export type CiaClaimStatus = {
  applicationUuid: string;
  claimUuid?: string;
  status?: string;
  docChecklist?: CiaClaimDoc[];
  settlementDeadlineAt?: string | null;
  penalInterestAccrued?: number;
  settledAmount?: number | null;
  claim?: null;   // present + null = policy exists but no claim yet
};

/** Claim status for the cattle policy (or {claim:null} if none yet). Non-ok = not insured. */
export async function getClaim(appUuid: string): Promise<CiaResult<CiaClaimStatus>> {
  const r = await apiGet(`${BASE}/applications/${encodeURIComponent(appUuid)}/claim`);
  if (r?.success) return { ok: true, data: r.data };
  return { ok: false, errorCode: r?.errorCode, message: r?.message };
}

/** ★ Report death/loss → intimates a KAVACH claim (4-doc, 15-day clock, 12% penal). */
export async function reportClaim(appUuid: string, body: { peril?: string; deathDate?: string; sumClaimed?: number }): Promise<CiaResult<any>> {
  const r = await apiPost(`${BASE}/applications/${encodeURIComponent(appUuid)}/claim`, body);
  if (r?.success) return { ok: true, data: r.data };
  return { ok: false, errorCode: r?.errorCode, message: r?.message };
}

/** Human-readable animal line for a scheme card, best-effort from the rules. */
export function schemeAnimal(s: CiaScheme): string {
  const a = (s.rules && (s.rules.animal || s.rules.animalType)) as string | undefined;
  return a || "";
}
