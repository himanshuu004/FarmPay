/**
 * CIA financial service (CIA-2) — subsidy calculation + subsidy-transfer and
 * disbursement RECORDING. The app records bank-authored financial events (it
 * never moves money). Every event is reconcilable; CIA credit is a distinct
 * ledger from KCC and the COOP 70% input credit (Convention 34).
 *
 * Subsidy split is computed from scheme config (rules_json), never hardcoded:
 *   subsidyAmount        = round(sanctioned × subsidyPct%)
 *   farmerContribution   = round(sanctioned × beneficiaryContributionPct%)
 *   loanComponent        = sanctioned − subsidyAmount − farmerContribution
 *
 * Transitions this slice authors:
 *   LOAN_SANCTIONED → SUBSIDY_TRANSFERRED → LOAN_DISBURSED → CATTLE_PURCHASE_PENDING
 * The last one unlocks the guided purchase (Slice H) end-to-end.
 */
const crypto = require('crypto');
const { emitDomainEvent } = require('../../../shared/services/domainEvents');
const { APP, guardTransition } = require('../constants/ciaStatus');
const { resolveActor } = require('./context');
const schemeConfigService = require('./schemeConfigService');

let db;
const getDb = () => { if (!db) db = require('../../../shared/models'); return db; };
const err = (msg, code, status = 400) => { const e = new Error(msg); e.statusCode = status; e.errorCode = code; return e; };
const round2 = (n) => Math.round(Number(n) * 100) / 100;

/** Compute the subsidy split for an application from its pinned scheme config. */
const computeSubsidy = async (app) => {
  const sanctioned = Number(app.sanctioned_amount || 0);
  if (!(sanctioned > 0)) throw err('Application has no sanctioned amount', 'CIA_NO_SANCTION', 409);
  const scheme = await schemeConfigService.getByVersion(app.scheme_version);
  const rules = scheme.rules_json || {};
  const subsidyPct = Number(rules.subsidyPct || 0);
  const contribPct = Number(rules.beneficiaryContributionPct || 0);
  const subsidyAmount = round2(sanctioned * subsidyPct / 100);
  const farmerContribution = round2(sanctioned * contribPct / 100);
  const loanComponent = round2(sanctioned - subsidyAmount - farmerContribution);
  return { sanctionedAmount: sanctioned, subsidyAmount, farmerContribution, loanComponent, subsidyPct, beneficiaryContributionPct: contribPct };
};

/** DUSS/finance checker: record the subsidy transfer → SUBSIDY_TRANSFERRED. */
const recordSubsidyTransfer = async (req) => {
  const actor = await resolveActor(req);
  if (!actor.appUserId) throw err('Unknown finance officer', 'CIA_ACTOR_UNKNOWN', 401);
  const { CiaApplication, CiaSubsidyTransfer, sequelize } = getDb();
  const b = req.body || {};

  const app = await CiaApplication.findOne({ where: { application_uuid: req.params.appUuid } });
  if (!app) throw err('Application not found', 'CIA_APP_NOT_FOUND', 404);
  if (app.status !== APP.LOAN_SANCTIONED) throw err(`Cannot record subsidy from ${app.status}`, 'CIA_APP_BAD_STATE', 409);

  const split = await computeSubsidy(app);
  return sequelize.transaction(async (t) => {
    await CiaSubsidyTransfer.create({
      transfer_uuid: crypto.randomUUID(), application_id: app.id,
      amount: split.subsidyAmount, transfer_ref: b.transferRef, bank_ref: b.bankRef || null,
      recorded_by_user_id: actor.appUserId, recorded_at: new Date(),
    }, { transaction: t });
    guardTransition('application', app.status, APP.SUBSIDY_TRANSFERRED);
    await app.update({ status: APP.SUBSIDY_TRANSFERRED, subsidy_amount: split.subsidyAmount, farmer_contribution: split.farmerContribution }, { transaction: t });
    await emitDomainEvent({
      eventType: 'cia.subsidy.transferred', aggregateType: 'CiaApplication', aggregateId: app.application_uuid,
      farmerId: null, payload: { amount: split.subsidyAmount, transferRef: b.transferRef, status: APP.SUBSIDY_TRANSFERRED },
    }, { transaction: t });
    return { applicationUuid: app.application_uuid, status: APP.SUBSIDY_TRANSFERRED, ...split };
  });
};

/**
 * Bank maker: record disbursement rows → LOAN_DISBURSED → CATTLE_PURCHASE_PENDING
 * (purchase unlocks). Each app must be SUBSIDY_TRANSFERRED. Idempotent per app
 * via the unique disbursement per application_id.
 */
const recordDisbursement = async (req) => {
  const actor = await resolveActor(req);
  if (!actor.appUserId) throw err('Unknown bank maker', 'CIA_ACTOR_UNKNOWN', 401);
  const { CiaApplication, CiaDisbursement, sequelize } = getDb();
  const rows = (req.body && req.body.rows) || [];

  const results = [];
  for (const row of rows) {
    const app = await CiaApplication.findOne({ where: { application_uuid: row.applicationUuid } });
    if (!app) { results.push({ applicationUuid: row.applicationUuid, status: 'NOT_FOUND' }); continue; }
    if (app.status !== APP.SUBSIDY_TRANSFERRED) { results.push({ applicationUuid: row.applicationUuid, status: 'SKIPPED', reason: `is ${app.status}` }); continue; }

    // eslint-disable-next-line no-await-in-loop
    await sequelize.transaction(async (t) => {
      await CiaDisbursement.create({
        disbursement_uuid: crypto.randomUUID(), application_id: app.id,
        loan_account: row.loanAccount, amount: row.amount, disbursement_ref: row.ref,
        recorded_by_user_id: actor.appUserId, recorded_at: new Date(),
      }, { transaction: t });
      guardTransition('application', app.status, APP.LOAN_DISBURSED);
      // Map loan account ↔ milk-payment account (the recovery source). The ERP
      // milk ledger is keyed by the member ref, so that is the milk-account key.
      await app.update({ status: APP.LOAN_DISBURSED, loan_account: row.loanAccount, milk_account_ref: app.farmer_ref }, { transaction: t });
      guardTransition('application', APP.LOAN_DISBURSED, APP.CATTLE_PURCHASE_PENDING);
      await app.update({ status: APP.CATTLE_PURCHASE_PENDING }, { transaction: t });
      await emitDomainEvent({
        eventType: 'cia.loan.disbursed', aggregateType: 'CiaApplication', aggregateId: app.application_uuid,
        farmerId: null, payload: { loanAccount: row.loanAccount, amount: row.amount, status: APP.CATTLE_PURCHASE_PENDING },
      }, { transaction: t });
    });
    results.push({ applicationUuid: row.applicationUuid, status: APP.CATTLE_PURCHASE_PENDING });
  }
  return { recorded: results };
};

module.exports = { computeSubsidy, recordSubsidyTransfer, recordDisbursement };
