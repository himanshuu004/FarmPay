/**
 * CIA controllers — HTTP only, no business logic (house pattern).
 * Services carry the logic and lazy-load the DB (getDb) to avoid circular deps.
 *
 * CIA-1 (MVP) handlers delegate to services (currently returning shaped stubs
 * to be filled in Claude Code). Endpoints for money movement and gated purchase
 * approval belong to CIA-2/CIA-3 and deliberately return 501 via `deferred()`.
 */
const { success, error } = require('../../../shared/utils/responseHelper');
const applicationService = require('../services/applicationService');
const selectionService = require('../services/selectionService');
const verificationService = require('../services/verificationService');
const dussService = require('../services/dussService');
const bankFiledropService = require('../services/bankFiledropService');
const purchaseCaptureService = require('../services/purchaseCaptureService');
const financialService = require('../services/financialService');
const emiService = require('../services/emiService');
const vetService = require('../services/vetService');
const fraudCheckService = require('../services/fraudCheckService');
const insuranceService = require('../services/insuranceService');
const paymentGateService = require('../services/paymentGateService');
const inspectionService = require('../services/inspectionService');
const claimIntegrationService = require('../services/claimIntegrationService');
const muzzleService = require('../services/muzzleService');
const ciaGrievanceService = require('../services/ciaGrievanceService');

/** 501 for phases not yet built — keeps the surface discoverable without faking behaviour. */
const deferred = (phase) => (req, res) =>
  error(res, { message: `Not implemented — lands in ${phase}`, errorCode: 'CIA_PHASE_DEFERRED', statusCode: 501 });

/* --------------------------------- farmer ---------------------------------- */
const getScheme = async (req, res, next) => {
  try { return success(res, { message: 'Scheme', data: await applicationService.getPublishedScheme(req) }); }
  catch (err) { next(err); }
};
const listSchemes = async (req, res, next) => {
  try { return success(res, { message: 'Schemes', data: await applicationService.listSchemes(req) }); }
  catch (err) { next(err); }
};
const getSchemeDetail = async (req, res, next) => {
  try { return success(res, { message: 'Scheme', data: await applicationService.getSchemeDetail(req) }); }
  catch (err) { next(err); }
};
const checkEligibility = async (req, res, next) => {
  try { return success(res, { message: 'Eligibility (non-binding)', data: await applicationService.checkEligibility(req) }); }
  catch (err) { next(err); }
};
const expressInterest = async (req, res, next) => {
  try { return success(res, { message: 'Interest submitted', data: await applicationService.expressInterest(req) }); }
  catch (err) { next(err); }
};
const listMyApplications = async (req, res, next) => {
  try { return success(res, { message: 'Applications', data: await applicationService.listForFarmer(req) }); }
  catch (err) { next(err); }
};
const createApplication = async (req, res, next) => {
  try { return success(res, { message: 'Draft created', data: await applicationService.createDraft(req) }); }
  catch (err) { next(err); }
};
const uploadDocument = async (req, res, next) => {
  try { return success(res, { message: 'Document uploaded', data: await applicationService.uploadDocument(req) }); }
  catch (err) { next(err); }
};
const submitApplication = async (req, res, next) => {
  try { return success(res, { message: 'Application submitted', data: await applicationService.submit(req) }); }
  catch (err) { next(err); }
};
const getStatus = async (req, res, next) => {
  try { return success(res, { message: 'Status', data: await applicationService.getStatus(req) }); }
  catch (err) { next(err); }
};
const getPurchaseState = async (req, res, next) => {
  try { return success(res, { message: 'Purchase state', data: await purchaseCaptureService.getState(req) }); }
  catch (err) { next(err); }
};
const capturePurchase = async (req, res, next) => {
  try { return success(res, { message: 'Purchase evidence captured', data: await purchaseCaptureService.capture(req) }); }
  catch (err) { next(err); }
};
const acknowledgeDelivery = async (req, res, next) => {
  try { return success(res, { message: 'Delivery acknowledged', data: await purchaseCaptureService.acknowledge(req) }); }
  catch (err) { next(err); }
};
const issueTransitInsurance = async (req, res, next) => {
  try { return success(res, { message: 'Transit policy issued', data: await insuranceService.issueTransit(req) }); }
  catch (err) { next(err); }
};
const confirmArrival = async (req, res, next) => {
  try { return success(res, { message: 'Arrival confirmed', data: await insuranceService.confirmArrival(req) }); }
  catch (err) { next(err); }
};
const issueCattleInsurance = async (req, res, next) => {
  try { return success(res, { message: 'Cattle policy issued', data: await insuranceService.issueCattle(req) }); }
  catch (err) { next(err); }
};

/* ---------------------------------- field ---------------------------------- */
const getFieldTasks = async (req, res, next) => {
  try { return success(res, { message: 'Field tasks', data: await verificationService.myTasks(req) }); }
  catch (err) { next(err); }
};
const submitVerification = async (req, res, next) => {
  try { return success(res, { message: 'Verification submitted', data: await verificationService.submit(req) }); }
  catch (err) { next(err); }
};
const syncQueue = async (req, res, next) => {
  try { return success(res, { message: 'Sync accepted', data: await verificationService.sync(req) }); }
  catch (err) { next(err); }
};
const submitVetExam = async (req, res, next) => {
  try { return success(res, { message: 'Vet exam recorded', data: await vetService.vetExam(req) }); }
  catch (err) { next(err); }
};
const runFraudChecks = async (req, res, next) => {
  try { return success(res, { message: 'Shadow checks complete', data: await fraudCheckService.runChecks(req) }); }
  catch (err) { next(err); }
};
const recordInspection = async (req, res, next) => {
  try { return success(res, { message: 'Inspection recorded', data: await inspectionService.recordInspection(req) }); }
  catch (err) { next(err); }
};
const enrolMuzzle = async (req, res, next) => {
  try { return success(res, { message: 'Muzzle enrolled (shadow)', data: await muzzleService.enrol(req) }); }
  catch (err) { next(err); }
};
const verifyMuzzle = async (req, res, next) => {
  try { return success(res, { message: 'Muzzle verified (shadow)', data: await muzzleService.verify(req) }); }
  catch (err) { next(err); }
};
const reportDeath = async (req, res, next) => {
  try { return success(res, { message: 'Claim intimated', data: await claimIntegrationService.reportDeath(req) }); }
  catch (err) { next(err); }
};
const getClaimStatus = async (req, res, next) => {
  try { return success(res, { message: 'Claim status', data: await claimIntegrationService.claimStatus(req) }); }
  catch (err) { next(err); }
};
const recordClaimLoanAdjustment = async (req, res, next) => {
  try { return success(res, { message: 'Loan adjusted', data: await claimIntegrationService.recordLoanAdjustment(req) }); }
  catch (err) { next(err); }
};

/* ----------------------------------- DCS ----------------------------------- */
const listInterested = async (req, res, next) => {
  try { return success(res, { message: 'Interested members', data: await selectionService.listInterested(req) }); }
  catch (err) { next(err); }
};
const recordSelection = async (req, res, next) => {
  try { return success(res, { message: 'Selection recorded', data: await selectionService.recordSelection(req) }); }
  catch (err) { next(err); }
};
const returnForCorrection = async (req, res, next) => {
  try { return success(res, { message: 'Returned for correction', data: await selectionService.returnForCorrection(req) }); }
  catch (err) { next(err); }
};

/* -------------------------------- DUSS ------------------------------------- */
const getBulkInbox = async (req, res, next) => {
  try { return success(res, { message: 'Bulk inbox', data: await dussService.inbox(req) }); }
  catch (err) { next(err); }
};
const scrutinise = async (req, res, next) => {
  try { return success(res, { message: 'Scrutiny recorded', data: await dussService.scrutinise(req) }); }
  catch (err) { next(err); }
};
const raiseDeficiency = async (req, res, next) => {
  try { return success(res, { message: 'Deficiency memo raised', data: await dussService.raiseDeficiency(req) }); }
  catch (err) { next(err); }
};
const generateBankBatch = async (req, res, next) => {
  try { return success(res, { message: 'Bank batch generated', data: await dussService.generateBankBatch(req) }); }
  catch (err) { next(err); }
};

/* ------------------------------ financial (CIA-2) -------------------------- */
const recordSubsidyTransfer = async (req, res, next) => {
  try { return success(res, { message: 'Subsidy transfer recorded', data: await financialService.recordSubsidyTransfer(req) }); }
  catch (err) { next(err); }
};
const uploadDisbursementFile = async (req, res, next) => {
  try { return success(res, { message: 'Disbursement recorded', data: await financialService.recordDisbursement(req) }); }
  catch (err) { next(err); }
};
const uploadEmiFile = async (req, res, next) => {
  try { return success(res, { message: 'EMI schedule ingested', data: await emiService.ingestSchedule(req) }); }
  catch (err) { next(err); }
};
const getEmiLedger = async (req, res, next) => {
  try { return success(res, { message: 'EMI', data: await emiService.getEmi(req) }); }
  catch (err) { next(err); }
};
const getNoDuesCert = async (req, res, next) => {
  try { return success(res, { message: 'No-dues certificate', data: await emiService.getNoDuesCertificate(req) }); }
  catch (err) { next(err); }
};
const remapMilkAccount = async (req, res, next) => {
  try { return success(res, { message: 'Milk account re-mapped', data: await emiService.remapMilkAccount(req) }); }
  catch (err) { next(err); }
};
const setMoratorium = async (req, res, next) => {
  try { return success(res, { message: 'Moratorium set', data: await emiService.setMoratorium(req) }); }
  catch (err) { next(err); }
};
const restructureLoan = async (req, res, next) => {
  try { return success(res, { message: 'Loan restructured', data: await emiService.restructureLoan(req) }); }
  catch (err) { next(err); }
};
const recordEmiConsent = async (req, res, next) => {
  try { return success(res, { message: 'Consent recorded', data: await emiService.recordConsent(req) }); }
  catch (err) { next(err); }
};
const revokeEmiConsent = async (req, res, next) => {
  try { return success(res, { message: 'Consent revoked', data: await emiService.revokeConsent(req) }); }
  catch (err) { next(err); }
};

/* --------------------------------- bank ------------------------------------ */
const listPackets = async (req, res, next) => {
  try { return success(res, { message: 'Packets', data: await bankFiledropService.listPackets(req) }); }
  catch (err) { next(err); }
};
const uploadSanctionFile = async (req, res, next) => {
  try { return success(res, { message: 'Sanction file staged (preview)', data: await bankFiledropService.stageSanctionFile(req) }); }
  catch (err) { next(err); }
};
const confirmSanctionFile = async (req, res, next) => {
  try { return success(res, { message: 'Sanction applied (matched rows only)', data: await bankFiledropService.confirmSanctionFile(req) }); }
  catch (err) { next(err); }
};
const recommendSellerPayment = async (req, res, next) => {
  try { return success(res, { message: 'Seller payment evaluated', data: await paymentGateService.recommendSellerPayment(req) }); }
  catch (err) { next(err); }
};
const confirmSellerPaid = async (req, res, next) => {
  try { return success(res, { message: 'Seller paid', data: await paymentGateService.confirmSellerPaid(req) }); }
  catch (err) { next(err); }
};

/* --------------------------------- admin ----------------------------------- */
const getCommandDashboard = async (req, res, next) => {
  try { return success(res, { message: 'Command dashboard', data: await dussService.commandDashboard(req) }); }
  catch (err) { next(err); }
};
const getReport = async (req, res, next) => {
  try { return success(res, { message: 'Report', data: await dussService.report(req) }); }
  catch (err) { next(err); }
};
const getAuditLog = async (req, res, next) => {
  try { return success(res, { message: 'Audit log', data: await dussService.auditLog(req) }); }
  catch (err) { next(err); }
};
const listExceptions = async (req, res, next) => {
  try { return success(res, { message: 'Exceptions', data: await fraudCheckService.listExceptions(req) }); }
  catch (err) { next(err); }
};
const clearException = async (req, res, next) => {
  try { return success(res, { message: 'Exception cleared', data: await fraudCheckService.clearException(req) }); }
  catch (err) { next(err); }
};
const getConfig = async (req, res, next) => {
  try { return success(res, { message: 'Config', data: await applicationService.getConfig(req) }); }
  catch (err) { next(err); }
};
const updateConfig = async (req, res, next) => {
  try { return success(res, { message: 'Config updated', data: await applicationService.updateConfig(req) }); }
  catch (err) { next(err); }
};

// ---- grievance (CIA-1/2, PRD Part 14B) ----
const raiseGrievance = async (req, res, next) => {
  try { return success(res, { message: 'Grievance raised', data: await ciaGrievanceService.raise(req), statusCode: 201 }); }
  catch (err) { next(err); }
};
const listMyGrievances = async (req, res, next) => {
  try { return success(res, { message: 'Grievances', data: await ciaGrievanceService.listForFarmer(req) }); }
  catch (err) { next(err); }
};
const listGrievanceQueue = async (req, res, next) => {
  try { return success(res, { message: 'Grievance queue', data: await ciaGrievanceService.listQueue(req) }); }
  catch (err) { next(err); }
};
const transitionGrievance = async (req, res, next) => {
  try { return success(res, { message: 'Grievance updated', data: await ciaGrievanceService.transition(req) }); }
  catch (err) { next(err); }
};

module.exports = {
  // farmer
  getScheme, listSchemes, getSchemeDetail, checkEligibility, expressInterest, listMyApplications, createApplication,
  uploadDocument, submitApplication, getStatus, getPurchaseState, capturePurchase, acknowledgeDelivery,
  issueTransitInsurance, confirmArrival, issueCattleInsurance,   // CIA-3 (Slice Q)
  reportDeath, getClaimStatus,           // CIA-4 (Slice U)
  getEmiLedger, getNoDuesCert, remapMilkAccount, setMoratorium,   // CIA-2 (Slice K/L + edges: no-dues, DCS re-map, moratorium)
  recordEmiConsent, revokeEmiConsent,    // CIA-2 (Slice N)
  // field
  getFieldTasks, submitVerification, syncQueue,
  submitVetExam,                         // CIA-3 (Slice O)
  runFraudChecks,                        // CIA-3 (Slice P)
  recordInspection,                      // CIA-4 (Slice T)
  enrolMuzzle, verifyMuzzle,             // CIA-4 (Slice V)
  // dcs
  listInterested, recordSelection, returnForCorrection,
  // duss
  getBulkInbox, scrutinise, raiseDeficiency, generateBankBatch,
  recordSubsidyTransfer,                 // CIA-2 (Slice J)
  // bank
  listPackets, uploadSanctionFile, confirmSanctionFile,
  recommendSellerPayment, confirmSellerPaid,   // CIA-3 (Slice R)
  uploadDisbursementFile,                // CIA-2 (Slice J)
  uploadEmiFile,                         // CIA-2 (Slice K)
  restructureLoan,                       // CIA-2 (Fix 8: loan restructure)
  // admin
  getCommandDashboard, getReport, getAuditLog, getConfig, updateConfig,
  listExceptions, clearException,        // CIA-3 (Slice S)
  recordClaimLoanAdjustment,             // CIA-4 (Slice U)
  // grievance (farmer raise/list; UCDF queue/transition) — PRD Part 14B
  raiseGrievance, listMyGrievances, listGrievanceQueue, transitionGrievance,
};
