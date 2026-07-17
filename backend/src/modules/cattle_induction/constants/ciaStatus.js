/**
 * CIA state machine — the single source of truth for application & purchase
 * status transitions (CLAUDE.md "CIA application" / "CIA purchase" diagrams).
 *
 * PRD Part 7 requires application.status to accept "valid transition only".
 * Services MUST route every status change through `guardTransition()` so an
 * illegal jump throws before any write, and so the legal graph lives in ONE
 * place (not scattered string literals). CIA-1 services only ever author the
 * subset of transitions they own; the rest of the graph is encoded so CIA-2/3/4
 * extend it without redefining it.
 */

/* --------------------------- application statuses -------------------------- */
const APP = {
  DRAFT: 'DRAFT',
  INTEREST_SUBMITTED: 'INTEREST_SUBMITTED',           // ★ farmer EOI
  PENDING_DCS_REVIEW: 'PENDING_DCS_REVIEW',
  SELECTED_BY_DCS: 'SELECTED_BY_DCS',                 // ‡ DCS board (in-app, Convention 30)
  NOT_SELECTED: 'NOT_SELECTED',
  APPLICATION_PENDING: 'APPLICATION_PENDING',
  DOCUMENTS_INCOMPLETE: 'DOCUMENTS_INCOMPLETE',
  PENDING_SUPERVISOR_VERIFY: 'PENDING_SUPERVISOR_VERIFY', // ‡ route supervisor (in-app)
  RETURNED_FOR_CORRECTION: 'RETURNED_FOR_CORRECTION',
  FORWARDED_TO_DUSS: 'FORWARDED_TO_DUSS',
  UNDER_DUSS_SCRUTINY: 'UNDER_DUSS_SCRUTINY',
  SUBMITTED_TO_BANK: 'SUBMITTED_TO_BANK',
  UNDER_BANK_APPRAISAL: 'UNDER_BANK_APPRAISAL',
  BANK_QUERY_RAISED: 'BANK_QUERY_RAISED',
  LOAN_SANCTIONED: 'LOAN_SANCTIONED',
  LOAN_REJECTED: 'LOAN_REJECTED',
  // --- CIA-2+ (money movement); encoded but not authored in CIA-1 ---
  SUBSIDY_TRANSFERRED: 'SUBSIDY_TRANSFERRED',
  LOAN_DISBURSED: 'LOAN_DISBURSED',
  CATTLE_PURCHASE_PENDING: 'CATTLE_PURCHASE_PENDING',
  PURCHASE_INITIATED: 'PURCHASE_INITIATED',
  SELLER_PAID: 'SELLER_PAID',
  EMI_ACTIVE: 'EMI_ACTIVE',
  EMI_OVERDUE: 'EMI_OVERDUE',
  LOAN_RESTRUCTURED: 'LOAN_RESTRUCTURED',
  LOAN_CLOSED: 'LOAN_CLOSED',
  APPLICATION_CLOSED: 'APPLICATION_CLOSED',
};

// Legal application transitions. Empty array = terminal.
const APP_TRANSITIONS = {
  [APP.DRAFT]: [APP.INTEREST_SUBMITTED],
  [APP.INTEREST_SUBMITTED]: [APP.PENDING_DCS_REVIEW],
  [APP.PENDING_DCS_REVIEW]: [APP.SELECTED_BY_DCS, APP.NOT_SELECTED],
  [APP.SELECTED_BY_DCS]: [APP.APPLICATION_PENDING],
  [APP.NOT_SELECTED]: [APP.APPLICATION_CLOSED],
  [APP.APPLICATION_PENDING]: [APP.PENDING_SUPERVISOR_VERIFY, APP.DOCUMENTS_INCOMPLETE],
  [APP.DOCUMENTS_INCOMPLETE]: [APP.PENDING_SUPERVISOR_VERIFY],
  [APP.PENDING_SUPERVISOR_VERIFY]: [APP.FORWARDED_TO_DUSS, APP.RETURNED_FOR_CORRECTION],
  [APP.RETURNED_FOR_CORRECTION]: [APP.APPLICATION_PENDING, APP.PENDING_SUPERVISOR_VERIFY],
  [APP.FORWARDED_TO_DUSS]: [APP.UNDER_DUSS_SCRUTINY],
  [APP.UNDER_DUSS_SCRUTINY]: [APP.SUBMITTED_TO_BANK, APP.DOCUMENTS_INCOMPLETE, APP.RETURNED_FOR_CORRECTION],
  [APP.SUBMITTED_TO_BANK]: [APP.UNDER_BANK_APPRAISAL, APP.LOAN_SANCTIONED, APP.LOAN_REJECTED],
  [APP.UNDER_BANK_APPRAISAL]: [APP.LOAN_SANCTIONED, APP.LOAN_REJECTED, APP.BANK_QUERY_RAISED],
  [APP.BANK_QUERY_RAISED]: [APP.UNDER_BANK_APPRAISAL],
  [APP.LOAN_SANCTIONED]: [APP.SUBSIDY_TRANSFERRED],       // CIA-2
  [APP.LOAN_REJECTED]: [APP.APPLICATION_CLOSED],
  [APP.SUBSIDY_TRANSFERRED]: [APP.LOAN_DISBURSED],        // CIA-2
  [APP.LOAN_DISBURSED]: [APP.CATTLE_PURCHASE_PENDING],    // CIA-2
  [APP.CATTLE_PURCHASE_PENDING]: [APP.PURCHASE_INITIATED],
  // CIA purchase machine drives the middle; a vet-rejected purchase bounces the
  // app back to CATTLE_PURCHASE_PENDING so the farmer can pick another animal.
  [APP.PURCHASE_INITIATED]: [APP.SELLER_PAID, APP.CATTLE_PURCHASE_PENDING],
  [APP.SELLER_PAID]: [APP.EMI_ACTIVE],
  [APP.EMI_ACTIVE]: [APP.EMI_OVERDUE, APP.LOAN_RESTRUCTURED, APP.LOAN_CLOSED],
  [APP.EMI_OVERDUE]: [APP.EMI_ACTIVE, APP.LOAN_RESTRUCTURED],
  [APP.LOAN_RESTRUCTURED]: [APP.EMI_ACTIVE],
  [APP.LOAN_CLOSED]: [APP.APPLICATION_CLOSED],
  [APP.APPLICATION_CLOSED]: [],
};

// Statuses a farmer's application row may be created AT (no "from" to guard).
const APP_INITIAL = [APP.DRAFT, APP.INTEREST_SUBMITTED];

/* ---------------------------- purchase statuses ---------------------------- */
const PURCHASE = {
  PURCHASE_INITIATED: 'PURCHASE_INITIATED',              // ★ farmer capture (CIA-1)
  VET_VERIFICATION_PENDING: 'VET_VERIFICATION_PENDING',  // CIA-3
  PURCHASE_APPROVED: 'PURCHASE_APPROVED',
  PURCHASE_REJECTED: 'PURCHASE_REJECTED',
  TRANSIT_IN_PROGRESS: 'TRANSIT_IN_PROGRESS',
  CATTLE_DELIVERED: 'CATTLE_DELIVERED',                  // ★ farmer acknowledge
  INSURANCE_PENDING: 'INSURANCE_PENDING',
  SELLER_PAYMENT_PENDING: 'SELLER_PAYMENT_PENDING',      // GATE (Convention 31) — unreachable in CIA-1
  SELLER_PAID: 'SELLER_PAID',
};

const PURCHASE_TRANSITIONS = {
  [PURCHASE.PURCHASE_INITIATED]: [PURCHASE.VET_VERIFICATION_PENDING],
  [PURCHASE.VET_VERIFICATION_PENDING]: [PURCHASE.PURCHASE_APPROVED, PURCHASE.PURCHASE_REJECTED],
  [PURCHASE.PURCHASE_APPROVED]: [PURCHASE.TRANSIT_IN_PROGRESS],
  [PURCHASE.PURCHASE_REJECTED]: [],
  [PURCHASE.TRANSIT_IN_PROGRESS]: [PURCHASE.CATTLE_DELIVERED],
  [PURCHASE.CATTLE_DELIVERED]: [PURCHASE.INSURANCE_PENDING],
  [PURCHASE.INSURANCE_PENDING]: [PURCHASE.SELLER_PAYMENT_PENDING],
  [PURCHASE.SELLER_PAYMENT_PENDING]: [PURCHASE.SELLER_PAID],
  [PURCHASE.SELLER_PAID]: [],
};

const GRAPHS = { application: APP_TRANSITIONS, purchase: PURCHASE_TRANSITIONS };

/**
 * Assert a transition is legal for the given machine; throw 409 otherwise.
 * @param {'application'|'purchase'} kind
 */
const guardTransition = (kind, from, to) => {
  const graph = GRAPHS[kind];
  if (!graph) { const e = new Error(`Unknown state machine: ${kind}`); e.statusCode = 500; e.errorCode = 'CIA_UNKNOWN_MACHINE'; throw e; }
  const allowed = graph[from];
  if (!allowed) { const e = new Error(`Unknown ${kind} status: ${from}`); e.statusCode = 409; e.errorCode = 'CIA_UNKNOWN_STATUS'; throw e; }
  if (!allowed.includes(to)) {
    const e = new Error(`Illegal ${kind} transition ${from} → ${to}`);
    e.statusCode = 409; e.errorCode = 'CIA_INVALID_TRANSITION';
    throw e;
  }
  return true;
};

const canTransition = (kind, from, to) => Boolean(GRAPHS[kind] && GRAPHS[kind][from] && GRAPHS[kind][from].includes(to));

module.exports = {
  APP, APP_TRANSITIONS, APP_INITIAL,
  PURCHASE, PURCHASE_TRANSITIONS,
  guardTransition, canTransition,
};
