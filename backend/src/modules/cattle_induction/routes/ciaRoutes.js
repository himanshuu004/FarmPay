/**
 * CIA routes. Six routers, mounted by app.js:
 *   farmerRouter  /api/v1/cattle-induction         FARMER (JWT)
 *   fieldRouter   /api/v1/cattle-induction/field    roleCheck ROUTE_SUPERVISOR / VET (offline PWA)
 *   dcsRouter     /api/v1/cattle-induction/dcs       roleCheck DCS_SECRETARY / DCS_BOARD
 *   dussRouter    /api/v1/cattle-induction/duss      roleCheck DUSS_* / DISTRICT_OFFICER (maker-checker)
 *   bankRouter    /api/v1/cattle-induction/bank      roleCheck BANK_* (maker-checker, file-upload mode)
 *   adminRouter   /api/v1/admin/cattle-induction     roleCheck UCDF_* / AUDITOR / GOV_VIEWER
 *
 * CIA-1 (MVP) authors: farmer EOI/application/purchase-capture★, DCS selection‡,
 * supervisor verification‡, DUSS scrutiny + bank-batch generation, bank status
 * via file upload. Money-movement endpoints (subsidy/disbursement/seller-payment)
 * and gated purchase-approval land in CIA-2/CIA-3 — stubbed 501 here by design.
 */
const express = require('express');
const multer = require('multer');
const ctrl = require('../controllers/ciaController');
const validate = require('../../../middleware/validate');
const { authenticate } = require('../../../middleware/auth');
const roleCheck = require('../../../middleware/roleCheck');
const requireAadhaarAuth = require('../../../middleware/requireAadhaarAuth'); // Tier-2 step-up on money-movement
const { ROLES, ROLE_GROUPS } = require('../../../shared/constants/roles');
const v = require('../validators/ciaValidator');

// memory storage — evidenceStorageService writes the raw buffer to disk
// unmodified (Convention 9/32: no resize/recompress on evidence photos).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image uploads allowed'));
  },
});

/* ------------------------------ farmer surface ----------------------------- */
const farmerRouter = express.Router();
farmerRouter.use(authenticate);
farmerRouter.get('/scheme', ctrl.getScheme);                       // latest published scheme (back-compat, single)
farmerRouter.get('/schemes', ctrl.listSchemes);                    // all schemes open at the society (multi-scheme)
farmerRouter.get('/schemes/:schemeVersion', validate(v.schemeVersionParam, 'params'), ctrl.getSchemeDetail); // one scheme's detail
farmerRouter.get('/eligibility', ctrl.checkEligibility);           // non-binding pre-screen (?scheme=<version>)
farmerRouter.post('/interest', validate(v.expressInterestSchema), ctrl.expressInterest); // EOI ★
farmerRouter.get('/applications', ctrl.listMyApplications);
farmerRouter.post('/applications', validate(v.createApplicationSchema), ctrl.createApplication); // DRAFT ★
farmerRouter.post('/applications/:appUuid/documents', validate(v.appUuidParam, 'params'), validate(v.uploadDocumentSchema), ctrl.uploadDocument);
// Generic live-capture evidence upload — the byte-storage step behind every
// docRef/photoRef/idProofRef/billRef/challanRef field CIA's JSON endpoints accept.
farmerRouter.post('/applications/:appUuid/evidence', validate(v.appUuidParam, 'params'), upload.single('photo'), ctrl.uploadEvidence);
farmerRouter.get('/applications/:appUuid/evidence/:contentHash', validate(v.appUuidParam, 'params'), ctrl.getEvidence);
farmerRouter.post('/applications/:appUuid/submit', validate(v.appUuidParam, 'params'), ctrl.submitApplication); // ★
farmerRouter.get('/applications/:appUuid/status', validate(v.appUuidParam, 'params'), ctrl.getStatus);
// Guided purchase — CIA-1 captures evidence; the payment GATE is enforced in CIA-3.
farmerRouter.get('/applications/:appUuid/purchase', validate(v.appUuidParam, 'params'), ctrl.getPurchaseState); // resumable hub state
farmerRouter.post('/applications/:appUuid/purchase/capture', validate(v.appUuidParam, 'params'), validate(v.purchaseCaptureSchema), ctrl.capturePurchase); // ★
farmerRouter.post('/applications/:appUuid/purchase/acknowledge', validate(v.appUuidParam, 'params'), ctrl.acknowledgeDelivery); // ★
// Guided purchase — CIA-3 insurance (transit before movement; cattle ≥ arrival).
farmerRouter.post('/applications/:appUuid/insurance/transit', validate(v.appUuidParam, 'params'), validate(v.transitInsuranceSchema), ctrl.issueTransitInsurance); // ★
farmerRouter.post('/applications/:appUuid/insurance/arrival', validate(v.appUuidParam, 'params'), validate(v.arrivalSchema), ctrl.confirmArrival);                  // ★
farmerRouter.post('/applications/:appUuid/insurance/cattle', validate(v.appUuidParam, 'params'), validate(v.cattleInsuranceSchema), ctrl.issueCattleInsurance);    // ★
farmerRouter.get('/applications/:appUuid/emi', validate(v.appUuidParam, 'params'), ctrl.getEmiLedger); // CIA-2: schedule (Slice K) + ledger (Slice L)
farmerRouter.get('/applications/:appUuid/emi/no-dues-certificate', validate(v.appUuidParam, 'params'), ctrl.getNoDuesCert); // CIA-2: no-dues cert on LOAN_CLOSED
// CIA-4 claims — reuse the platform CLAIMS engine (SLA + penal interest + hash-chain).
farmerRouter.post('/applications/:appUuid/claim', validate(v.appUuidParam, 'params'), validate(v.claimReportSchema), ctrl.reportDeath); // ★
farmerRouter.get('/applications/:appUuid/claim', validate(v.appUuidParam, 'params'), ctrl.getClaimStatus);
farmerRouter.post('/applications/:appUuid/emi/consent', validate(v.appUuidParam, 'params'), validate(v.emiConsentSchema), requireAadhaarAuth, ctrl.recordEmiConsent);       // ★ CIA-2: tri-partite consent → INITIATE (Aadhaar step-up)
farmerRouter.post('/applications/:appUuid/emi/consent/revoke', validate(v.appUuidParam, 'params'), ctrl.revokeEmiConsent);                            // ★ CIA-2: revoke → TRACK
// Grievance (PRD Part 14B) — farmer raise + track own.
farmerRouter.post('/grievances', validate(v.raiseGrievanceSchema), ctrl.raiseGrievance);       // ★
farmerRouter.get('/grievances', ctrl.listMyGrievances);

/* --------------------------- field PWA (offline) --------------------------- */
const fieldRouter = express.Router();
fieldRouter.use(authenticate, roleCheck(...ROLE_GROUPS.CIA_FIELD_ROLES));
fieldRouter.get('/tasks', ctrl.getFieldTasks);
fieldRouter.post('/verify/:appUuid', validate(v.appUuidParam, 'params'), validate(v.verificationSchema), roleCheck(ROLES.ROUTE_SUPERVISOR), ctrl.submitVerification); // ‡ geo + live photos
fieldRouter.post('/vet/:appUuid', validate(v.appUuidParam, 'params'), validate(v.vetExamSchema), roleCheck(ROLES.VET), ctrl.submitVetExam);                     // CIA-3: exam + valuation + e-sign
fieldRouter.post('/purchase/:appUuid/checks', validate(v.appUuidParam, 'params'), ctrl.runFraudChecks); // CIA-3: anti-fraud shadow checks
fieldRouter.post('/inspection/:appUuid', validate(v.appUuidParam, 'params'), validate(v.inspectionSchema), ctrl.recordInspection); // CIA-4: post-purchase inspection
fieldRouter.post('/muzzle/:appUuid/enrol', validate(v.appUuidParam, 'params'), validate(v.muzzleSchema), ctrl.enrolMuzzle);   // CIA-4: muzzle re-ID (shadow)
fieldRouter.post('/muzzle/:appUuid/verify', validate(v.appUuidParam, 'params'), validate(v.muzzleSchema), ctrl.verifyMuzzle);
fieldRouter.post('/sync', ctrl.syncQueue);                          // idempotent offline batch sync

/* -------------------------------- DCS surface ------------------------------ */
const dcsRouter = express.Router();
dcsRouter.use(authenticate, roleCheck(...ROLE_GROUPS.CIA_DCS_ROLES));
dcsRouter.get('/interested', ctrl.listInterested);
dcsRouter.post('/select/:appUuid', validate(v.appUuidParam, 'params'), validate(v.selectionSchema), roleCheck(ROLES.DCS_BOARD), ctrl.recordSelection); // ‡ board decision + resolution
dcsRouter.post('/applications/:appUuid/return', validate(v.appUuidParam, 'params'), validate(v.returnSchema), ctrl.returnForCorrection);

/* ---------------------------- DUSS / district ------------------------------ */
const dussRouter = express.Router();
dussRouter.use(authenticate, roleCheck(...ROLE_GROUPS.CIA_DUSS_ROLES));
dussRouter.get('/inbox', ctrl.getBulkInbox);
dussRouter.post('/scrutinise/:appUuid', validate(v.appUuidParam, 'params'), roleCheck(ROLES.DUSS_MAKER), ctrl.scrutinise);        // maker
dussRouter.post('/deficiency/:appUuid', validate(v.appUuidParam, 'params'), validate(v.deficiencySchema), roleCheck(ROLES.DUSS_MAKER), ctrl.raiseDeficiency);
dussRouter.post('/batch', validate(v.batchSchema), roleCheck(ROLES.DUSS_CHECKER), ctrl.generateBankBatch);        // checker → prescribed-format packet
dussRouter.post('/subsidy/:appUuid', validate(v.appUuidParam, 'params'), validate(v.subsidyTransferSchema), roleCheck(ROLES.DUSS_CHECKER), requireAadhaarAuth, ctrl.recordSubsidyTransfer); // CIA-2: record DUSS→bank subsidy transfer (Aadhaar step-up)
dussRouter.post('/emi/:appUuid/remap', validate(v.appUuidParam, 'params'), validate(v.remapMilkAccountSchema), roleCheck(ROLES.DUSS_CHECKER), ctrl.remapMilkAccount); // CIA-2: farmer shifted society → re-map milk account
dussRouter.post('/emi/:appUuid/moratorium', validate(v.appUuidParam, 'params'), validate(v.setMoratoriumSchema), roleCheck(ROLES.DUSS_CHECKER), ctrl.setMoratorium); // CIA-2: repayment moratorium (PRD 7.5)

/* ------------------------------ bank surface ------------------------------- */
const bankRouter = express.Router();
bankRouter.use(authenticate, roleCheck(...ROLE_GROUPS.CIA_BANK_ROLES));
bankRouter.get('/packets', ctrl.listPackets);                       // download generated packet
bankRouter.post('/sanction-file', validate(v.sanctionFileSchema), roleCheck(ROLES.BANK_MAKER), ctrl.uploadSanctionFile);      // maker: upload → validation preview
bankRouter.post('/sanction-file/confirm', validate(v.sanctionConfirmSchema), roleCheck(ROLES.BANK_CHECKER), requireAadhaarAuth, ctrl.confirmSanctionFile); // checker: apply matched rows only (Aadhaar step-up — commits sanctioned amount)
bankRouter.post('/disbursement-file', validate(v.disbursementFileSchema), roleCheck(ROLES.BANK_MAKER), requireAadhaarAuth, ctrl.uploadDisbursementFile);    // CIA-2: record disbursement → unlocks purchase (Aadhaar step-up — releases loan money)
bankRouter.post('/emi-file', validate(v.emiFileSchema), roleCheck(ROLES.BANK_MAKER), ctrl.uploadEmiFile);                      // CIA-2: idempotent EMI-schedule ingest
bankRouter.post('/emi/:appUuid/restructure', validate(v.appUuidParam, 'params'), validate(v.restructureLoanSchema), roleCheck(ROLES.BANK_CHECKER), ctrl.restructureLoan); // CIA-2: loan restructure (PRD 7.5)
// CIA-3 payment gate — recommend (maker) then confirm (checker, SoD). Recommend never executes.
bankRouter.post('/seller-payment/:appUuid/recommend', validate(v.appUuidParam, 'params'), roleCheck(ROLES.BANK_MAKER), requireAadhaarAuth, ctrl.recommendSellerPayment);
bankRouter.post('/seller-payment/:appUuid/confirm', validate(v.appUuidParam, 'params'), roleCheck(ROLES.BANK_CHECKER), requireAadhaarAuth, ctrl.confirmSellerPaid);

/* ------------------------------ UCDF / admin ------------------------------- */
const adminRouter = express.Router();
adminRouter.use(authenticate, roleCheck(...ROLE_GROUPS.CIA_UCDF_ROLES));
adminRouter.get('/dashboard', ctrl.getCommandDashboard);
adminRouter.get('/reports/:reportKey', ctrl.getReport);
adminRouter.get('/audit-log', ctrl.getAuditLog);                    // AUDITOR read-only
adminRouter.post('/claim/:appUuid/adjust-loan', validate(v.appUuidParam, 'params'), roleCheck(ROLES.UCDF_PM, ROLES.UCDF_FINANCE), ctrl.recordClaimLoanAdjustment); // CIA-4: loan adjustment on settled claim — write: PM/Finance only (excludes AUDITOR/GOV_VIEWER)
adminRouter.get('/exceptions', ctrl.listExceptions);                                                    // CIA-3: fraud exception panel (shadow)
adminRouter.post('/exceptions/:appUuid/clear', validate(v.appUuidParam, 'params'), validate(v.clearExceptionSchema), roleCheck(ROLES.UCDF_PM, ROLES.UCDF_FINANCE), ctrl.clearException); // review & clear (reason) — write: PM/Finance only (un-holds the payment gate; excludes AUDITOR/GOV_VIEWER)
// Grievance — queue is read-only for all UCDF roles (incl. AUDITOR); acting on one
// (transition) is a write, so it excludes read-only AUDITOR/GOV_VIEWER.
adminRouter.get('/grievances', ctrl.listGrievanceQueue);
adminRouter.post('/grievances/:grievanceUuid/transition', validate(v.grievanceUuidParam, 'params'), validate(v.grievanceTransitionSchema), roleCheck(ROLES.UCDF_PM, ROLES.UCDF_FINANCE, ROLES.UCDF_ADMIN), ctrl.transitionGrievance);
adminRouter.get('/config', roleCheck(ROLES.UCDF_ADMIN), ctrl.getConfig);
adminRouter.put('/config', roleCheck(ROLES.UCDF_ADMIN), validate(v.schemeConfigSchema), ctrl.updateConfig);

module.exports = { farmerRouter, fieldRouter, dcsRouter, dussRouter, bankRouter, adminRouter };
