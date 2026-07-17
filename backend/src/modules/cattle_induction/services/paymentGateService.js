/**
 * CIA payment gate + seller-payment recommendation (CIA-3, Convention 31).
 *
 * The gate opens ONLY when: vet_certified + transit_insured + cattle_insured +
 * farmer_acknowledged, the traceability chain is complete (application → animal →
 * seller → transport → transit&cattle policies), the payee is the penny-drop-
 * verified registered seller, and there is no UNRESOLVED blocking exception flag.
 *
 * The gate RECOMMENDS a payout — it never executes payment or auto-rejects. A
 * failed input raises a human-review exception and HOLDS payment (never silent).
 * Execution is a separate, human-authorised confirm that calls the payment rail
 * (mock; live notReady, #9). On payout: SELLER_PAID → app EMI_ACTIVE.
 */
const crypto = require('crypto');
const { emitDomainEvent } = require('../../../shared/services/domainEvents');
const { paymentRails } = require('../../../integrations');
const { APP, PURCHASE, guardTransition } = require('../constants/ciaStatus');
const { resolveActor } = require('./context');
const { assertDifferentActor } = require('./segregation');

let db;
const getDb = () => { if (!db) db = require('../../../shared/models'); return db; };
const err = (msg, code, status = 400) => { const e = new Error(msg); e.statusCode = status; e.errorCode = code; return e; };

// Flags that HOLD payment until a human clears them (Slice S). PRICE_OUTLIER is
// advisory (shown, non-blocking).
const BLOCKING_FLAGS = ['PAYEE_UNVERIFIED', 'PAYEE_NAME_MISMATCH', 'REGISTRY_DUPLICATE', 'GEOFENCE_BREACH', 'DUPLICATE_PHOTO'];

const loadContext = async (appUuid) => {
  const { CiaApplication, CiaPurchase, CiaSeller, CiaAnimal, CiaTransport, CiaInsuranceLink } = getDb();
  const app = await CiaApplication.findOne({ where: { application_uuid: appUuid } });
  if (!app) throw err('Application not found', 'CIA_APP_NOT_FOUND', 404);
  const purchase = await CiaPurchase.findOne({ where: { application_id: app.id } });
  if (!purchase) throw err('No captured purchase', 'CIA_PURCHASE_NONE', 404);
  const seller = purchase.seller_id ? await CiaSeller.findByPk(purchase.seller_id) : null;
  const animal = purchase.animal_id ? await CiaAnimal.findByPk(purchase.animal_id) : null;
  const transport = await CiaTransport.findOne({ where: { purchase_id: purchase.id } });
  const links = await CiaInsuranceLink.findAll({ where: { purchase_id: purchase.id } });
  return { app, purchase, seller, animal, transport, links };
};

/** Pure gate evaluation → { open, reasons, blockingFlags, payeeAccount, amount }. */
const evaluateGate = (ctx) => {
  const { purchase, seller, animal, transport, links } = ctx;
  const reasons = [];
  if (!purchase.vet_certified) reasons.push('vet_certified');
  if (!purchase.transit_insured) reasons.push('transit_insured');
  if (!purchase.cattle_insured) reasons.push('cattle_insured');
  if (!purchase.farmer_acknowledged) reasons.push('farmer_acknowledged');

  const chainComplete = Boolean(purchase.animal_id && purchase.seller_id && animal && seller && transport
    && purchase.purchase_lat != null
    && links.some((l) => l.policy_type === 'TRANSIT') && links.some((l) => l.policy_type === 'CATTLE'));
  if (!chainComplete) reasons.push('traceability_chain');

  const payeeVerified = Boolean(seller && seller.account_verified);
  if (!payeeVerified) reasons.push('payee_verified');

  const flags = Array.isArray(purchase.exception_flags) ? purchase.exception_flags : [];
  const blockingFlags = flags.filter((f) => BLOCKING_FLAGS.includes(f));
  if (blockingFlags.length) reasons.push('unresolved_exceptions');

  return {
    open: reasons.length === 0,
    reasons,
    blockingFlags,
    payeeAccount: seller ? seller.bank_account : null,
    amount: animal && animal.approved_purchase_price != null ? Number(animal.approved_purchase_price) : null,
  };
};

/**
 * Recommend the seller payment (BANK_MAKER). Never executes. If the gate is
 * closed, records a HOLD exception and returns the failed reasons — no transition,
 * never a silent block. If open, re-verifies the payee (penny-drop), creates the
 * RECOMMENDED payout and moves INSURANCE_PENDING → SELLER_PAYMENT_PENDING.
 */
const recommendSellerPayment = async (req) => {
  const actor = await resolveActor(req);
  if (!actor.appUserId) throw err('Unknown actor', 'CIA_ACTOR_UNKNOWN', 401);
  const ctx = await loadContext(req.params.appUuid);
  const { app, purchase, seller } = ctx;
  if (purchase.status !== PURCHASE.INSURANCE_PENDING) throw err(`Cannot recommend payment from ${purchase.status}`, 'CIA_PURCHASE_BAD_STATE', 409);

  const gate = evaluateGate(ctx);
  const { CiaSellerPayout, sequelize } = getDb();

  if (!gate.open) {
    await emitDomainEvent({
      eventType: 'cia.payment.gate_held', aggregateType: 'CiaApplication', aggregateId: app.application_uuid,
      farmerId: null, payload: { reasons: gate.reasons, blockingFlags: gate.blockingFlags, heldBy: actor.appUserId },
    });
    return { applicationUuid: app.application_uuid, gateOpen: false, reasons: gate.reasons, blockingFlags: gate.blockingFlags, held: true };
  }

  // Payee must equal the penny-drop-verified registered seller (re-verify at pay time).
  const pd = await paymentRails.pennyDrop({ accountNumber: seller.bank_account, ifsc: seller.bank_ifsc, name: seller.name });
  if (!pd.verified || !pd.nameMatch) {
    await emitDomainEvent({
      eventType: 'cia.payment.gate_held', aggregateType: 'CiaApplication', aggregateId: app.application_uuid,
      farmerId: null, payload: { reasons: ['payee_verified'], blockingFlags: [pd.verified ? 'PAYEE_NAME_MISMATCH' : 'PAYEE_UNVERIFIED'], heldBy: actor.appUserId },
    });
    return { applicationUuid: app.application_uuid, gateOpen: false, reasons: ['payee_verified'], held: true };
  }

  return sequelize.transaction(async (t) => {
    const payout = await CiaSellerPayout.create({
      payout_uuid: crypto.randomUUID(), application_id: app.id, purchase_id: purchase.id, seller_id: seller.id,
      payee_account: seller.bank_account, amount: gate.amount, status: 'RECOMMENDED',
      penny_drop_ref: pd.ref, recommended_by_user_id: actor.appUserId, recommended_at: new Date(),
    }, { transaction: t });
    guardTransition('purchase', purchase.status, PURCHASE.SELLER_PAYMENT_PENDING);
    await purchase.update({ status: PURCHASE.SELLER_PAYMENT_PENDING }, { transaction: t });
    await emitDomainEvent({
      eventType: 'cia.payment.recommended', aggregateType: 'CiaApplication', aggregateId: app.application_uuid,
      farmerId: null, payload: { payoutUuid: payout.payout_uuid, amount: gate.amount, payeeAccount: seller.bank_account, by: actor.appUserId },
    }, { transaction: t });
    return { applicationUuid: app.application_uuid, gateOpen: true, payoutUuid: payout.payout_uuid, amount: gate.amount, action: 'RECOMMEND_ONLY', purchaseStatus: PURCHASE.SELLER_PAYMENT_PENDING };
  });
};

/**
 * Confirm the seller payout (BANK_CHECKER; must differ from the recommender —
 * SoD). Executes via the payment rail (mock; live notReady) → SELLER_PAID → app
 * EMI_ACTIVE.
 */
const confirmSellerPaid = async (req) => {
  const actor = await resolveActor(req);
  if (!actor.appUserId) throw err('Unknown actor', 'CIA_ACTOR_UNKNOWN', 401);
  const { CiaApplication, CiaPurchase, CiaSellerPayout, sequelize } = getDb();
  const app = await CiaApplication.findOne({ where: { application_uuid: req.params.appUuid } });
  if (!app) throw err('Application not found', 'CIA_APP_NOT_FOUND', 404);
  const purchase = await CiaPurchase.findOne({ where: { application_id: app.id } });
  const payout = await CiaSellerPayout.findOne({ where: { purchase_id: purchase.id, status: 'RECOMMENDED' } });
  if (!payout) throw err('No recommended payout to confirm', 'CIA_PAYOUT_NONE', 404);
  assertDifferentActor(payout.recommended_by_user_id, actor.appUserId);
  if (purchase.status !== PURCHASE.SELLER_PAYMENT_PENDING) throw err(`Cannot pay from ${purchase.status}`, 'CIA_PURCHASE_BAD_STATE', 409);

  // Execute via the payment rail (mock accepts; live notReady until #9).
  const res = await paymentRails.payout({ payeeAccount: payout.payee_account, amount: Number(payout.amount), reference: payout.payout_uuid });

  return sequelize.transaction(async (t) => {
    await payout.update({ status: 'PAID', payout_ref: res.payoutRef, confirmed_by_user_id: actor.appUserId, paid_at: new Date() }, { transaction: t });
    guardTransition('purchase', purchase.status, PURCHASE.SELLER_PAID);
    await purchase.update({ status: PURCHASE.SELLER_PAID }, { transaction: t });
    // App advances into repayment.
    guardTransition('application', app.status, APP.SELLER_PAID);
    await app.update({ status: APP.SELLER_PAID }, { transaction: t });
    guardTransition('application', APP.SELLER_PAID, APP.EMI_ACTIVE);
    await app.update({ status: APP.EMI_ACTIVE }, { transaction: t });
    await emitDomainEvent({
      eventType: 'cia.payment.paid', aggregateType: 'CiaApplication', aggregateId: app.application_uuid,
      farmerId: null, payload: { payoutRef: res.payoutRef, by: actor.appUserId, status: APP.EMI_ACTIVE },
    }, { transaction: t });
    return { applicationUuid: app.application_uuid, payoutRef: res.payoutRef, purchaseStatus: PURCHASE.SELLER_PAID, applicationStatus: APP.EMI_ACTIVE };
  });
};

module.exports = { evaluateGate, recommendSellerPayment, confirmSellerPaid, BLOCKING_FLAGS };
