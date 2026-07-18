import { api } from './client';

// Wraps /api/v1/cattle-induction/field/* — mirrors the real backend routes
// exactly (backend/src/modules/cattle_induction/routes/ciaRoutes.js's
// fieldRouter + verificationService/vetService/inspectionService), verified
// against the actual Joi validators, not guessed field names.

export type Geo = { lat: number; lng: number };

export type FieldTask =
  | { kind: 'verify'; applicationUuid: string; farmerRef: string; farmerName: string | null; dcsRef: string; requestedCattleCount: number | null; preferredBreed: string | null; status: string; submittedAt: string }
  | { kind: 'vetExam'; applicationUuid: string; farmerRef: string; farmerName: string | null; dcsRef: string; purchaseStatus: string; earTagNo: string | null; species: string | null; breed: string | null; initiatedAt: string }
  | { kind: 'inspection'; applicationUuid: string; farmerRef: string; farmerName: string | null; dcsRef: string; dueDay: number; dueDate: string; overdue: boolean; earTagNo: string | null };

export async function getTasks() {
  return api.get('/cattle-induction/field/tasks');
}

export type VerificationBody = {
  result: 'APPROVED' | 'RETURNED';
  remarks?: string;
  shedGeo: Geo;
  residenceGeo: Geo;
  mediaRefs: string[];
  checks?: {
    identity_ok?: boolean;
    membership_ok?: boolean;
    milk_pouring_ok?: boolean;
    existing_cattle_note?: string;
  };
  capturedOffline?: boolean;
};

export async function submitVerification(appUuid: string, body: VerificationBody) {
  return api.post(`/cattle-induction/field/verify/${appUuid}`, body);
}

export type VetExamBody = {
  result: 'APPROVED' | 'REJECTED';
  remarks?: string;
  bodyConditionScore?: number;
  ageMonths?: number;
  testMilking?: number;
  dailyMilkYield?: number;
  estimatedMarketValue?: number;
  approvedPurchasePrice?: number;
  fitnessForTransport?: true;
  esign?: { vetReg: string };
};

export async function submitVetExam(appUuid: string, body: VetExamBody) {
  return api.post(`/cattle-induction/field/vet/${appUuid}`, body);
}

export async function runFraudChecks(appUuid: string) {
  return api.post(`/cattle-induction/field/purchase/${appUuid}/checks`);
}

export type InspectionBody = {
  dueDay: 7 | 30 | 90;
  earTagNo: string;
  photoRefs: string[];
  healthy?: boolean;
  milkYield?: number;
};

export async function submitInspection(appUuid: string, body: InspectionBody) {
  return api.post(`/cattle-induction/field/inspection/${appUuid}`, body);
}

export type SyncOp = {
  opUuid: string;
  clientTs: string;
  appUuid: string;
} & VerificationBody;

export async function syncOps(deviceId: string, ops: SyncOp[]) {
  return api.post('/cattle-induction/field/sync', { deviceId, ops });
}

/** Live-capture evidence upload — field-scoped (NOT the farmer-owned CIA
 * application evidence endpoint, which 403s any non-owner). Real SHA-256,
 * unmodified bytes (Convention 9). Returns {url, contentHash}. */
export async function uploadEvidence(appUuid: string, file: Blob, filename: string) {
  const form = new FormData();
  form.append('photo', file, filename);
  return api.postForm(`/cattle-induction/field/evidence/${appUuid}`, form);
}
