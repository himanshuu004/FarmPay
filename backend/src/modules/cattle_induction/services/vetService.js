/**
 * CIA vet service (CIA-3) — VCI-registered vet examination, valuation and
 * fitness-for-transport e-sign. This sets the FIRST payment-gate input
 * (vet_certified) and the approved price.
 *
 * Guardrails (Convention 31/32): the approved price must be ≤ the config ceiling
 * (hard stop); a price outside the breed/region band raises a PRICE_OUTLIER
 * exception flag (shadow — surfaced to humans, never an auto-reject). The vet
 * cannot approve payment — that is the gate (Slice R).
 *
 *   purchase: PURCHASE_INITIATED → VET_VERIFICATION_PENDING → PURCHASE_APPROVED
 *             (| PURCHASE_REJECTED → app back to CATTLE_PURCHASE_PENDING)
 */
const { emitDomainEvent } = require('../../../shared/services/domainEvents');
const { APP, PURCHASE, guardTransition } = require('../constants/ciaStatus');
const { resolveActor } = require('./context');
const schemeConfigService = require('./schemeConfigService');

let db;
const getDb = () => { if (!db) db = require('../../../shared/models'); return db; };
const err = (msg, code, status = 400) => { const e = new Error(msg); e.statusCode = status; e.errorCode = code; return e; };

const vetExam = async (req) => {
  const actor = await resolveActor(req);
  if (!actor.appUserId) throw err('Unknown vet', 'CIA_ACTOR_UNKNOWN', 401);
  const { CiaApplication, CiaPurchase, CiaAnimal, sequelize } = getDb();
  const b = req.body || {};

  const app = await CiaApplication.findOne({ where: { application_uuid: req.params.appUuid } });
  if (!app) throw err('Application not found', 'CIA_APP_NOT_FOUND', 404);
  const purchase = await CiaPurchase.findOne({ where: { application_id: app.id } });
  if (!purchase) throw err('No captured purchase to examine', 'CIA_PURCHASE_NONE', 404);
  if (purchase.status !== PURCHASE.PURCHASE_INITIATED) throw err(`Cannot examine from ${purchase.status}`, 'CIA_PURCHASE_BAD_STATE', 409);
  const animal = await CiaAnimal.findByPk(purchase.animal_id);

  const scheme = await schemeConfigService.getByVersion(app.scheme_version);
  const rules = scheme.rules_json || {};

  if (b.result === 'REJECTED') {
    return sequelize.transaction(async (t) => {
      guardTransition('purchase', purchase.status, PURCHASE.VET_VERIFICATION_PENDING);
      await purchase.update({ status: PURCHASE.VET_VERIFICATION_PENDING }, { transaction: t });
      guardTransition('purchase', PURCHASE.VET_VERIFICATION_PENDING, PURCHASE.PURCHASE_REJECTED);
      await purchase.update({ status: PURCHASE.PURCHASE_REJECTED }, { transaction: t });
      guardTransition('application', app.status, APP.CATTLE_PURCHASE_PENDING);
      await app.update({ status: APP.CATTLE_PURCHASE_PENDING }, { transaction: t });
      await emitDomainEvent({
        eventType: 'cia.vet.rejected', aggregateType: 'CiaApplication', aggregateId: app.application_uuid,
        farmerId: null, payload: { by: actor.appUserId, remarks: b.remarks, purchaseStatus: PURCHASE.PURCHASE_REJECTED },
      }, { transaction: t });
      return { applicationUuid: app.application_uuid, result: 'REJECTED', purchaseStatus: PURCHASE.PURCHASE_REJECTED, applicationStatus: APP.CATTLE_PURCHASE_PENDING };
    });
  }

  // APPROVED — hard ceiling stop, then shadow outlier flag.
  const ceiling = rules.priceCeiling != null ? Number(rules.priceCeiling) : null;
  if (ceiling != null && Number(b.approvedPurchasePrice) > ceiling) {
    throw err(`Approved price exceeds the ceiling of ₹${ceiling}`, 'CIA_PRICE_OVER_CEILING', 422);
  }
  const band = Array.isArray(rules.priceBand) ? rules.priceBand : null;   // [min, max]
  const ap = Number(b.approvedPurchasePrice);
  const mv = Number(b.estimatedMarketValue);
  const outlier = (band && (ap < band[0] || ap > band[1])) || (mv > 0 && Math.abs(ap - mv) > 0.15 * mv);

  return sequelize.transaction(async (t) => {
    if (animal) {
      await animal.update({
        estimated_market_value: mv, approved_purchase_price: ap,
        body_condition_score: b.bodyConditionScore != null ? b.bodyConditionScore : animal.body_condition_score,
        age_months: b.ageMonths != null ? b.ageMonths : animal.age_months,
        pregnancy_status: b.pregnancyStatus || animal.pregnancy_status,
        daily_milk_yield: b.dailyMilkYield != null ? b.dailyMilkYield : animal.daily_milk_yield,
        // PRD Part 7.3 health/valuation fields — persisted instead of silently dropped.
        test_milking: b.testMilking != null ? b.testMilking : animal.test_milking,
        mastitis_screening: b.mastitisScreening || animal.mastitis_screening,
        parity: b.parity != null ? b.parity : animal.parity,
        lactation_number: b.lactationNumber != null ? b.lactationNumber : animal.lactation_number,
        last_calving_date: b.lastCalvingDate || animal.last_calving_date,
        expected_yield: b.expectedYield != null ? b.expectedYield : animal.expected_yield,
        horn_characteristics: b.hornCharacteristics || animal.horn_characteristics,
        dentition: b.dentition || animal.dentition,
        vaccination_history: b.vaccinationHistory != null ? b.vaccinationHistory : animal.vaccination_history,
        deworming_history: b.dewormingHistory != null ? b.dewormingHistory : animal.deworming_history,
        disease_history: b.diseaseHistory || animal.disease_history,
        reproductive_history: b.reproductiveHistory || animal.reproductive_history,
        pregnancy_diagnosis: b.pregnancyDiagnosis || animal.pregnancy_diagnosis,
        fitness_for_transport: true,
      }, { transaction: t });
    }
    const flags = Array.isArray(purchase.exception_flags) ? [...purchase.exception_flags] : [];
    if (outlier && !flags.includes('PRICE_OUTLIER')) flags.push('PRICE_OUTLIER');

    guardTransition('purchase', purchase.status, PURCHASE.VET_VERIFICATION_PENDING);
    await purchase.update({ status: PURCHASE.VET_VERIFICATION_PENDING }, { transaction: t });
    guardTransition('purchase', PURCHASE.VET_VERIFICATION_PENDING, PURCHASE.PURCHASE_APPROVED);
    await purchase.update({ status: PURCHASE.PURCHASE_APPROVED, vet_certified: true, exception_flags: flags }, { transaction: t });

    await emitDomainEvent({
      eventType: 'cia.vet.certified', aggregateType: 'CiaApplication', aggregateId: app.application_uuid,
      farmerId: null, payload: { by: actor.appUserId, vetReg: b.esign.vetReg, approvedPurchasePrice: ap, exceptionFlags: flags, purchaseStatus: PURCHASE.PURCHASE_APPROVED },
    }, { transaction: t });

    return {
      applicationUuid: app.application_uuid, result: 'APPROVED', vetCertified: true,
      purchaseStatus: PURCHASE.PURCHASE_APPROVED, approvedPurchasePrice: ap, exceptionFlags: flags,
    };
  });
};

module.exports = { vetExam };
