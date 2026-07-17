/**
 * CIA purchase capture service — guided cattle purchase evidence (CIA-1 captures;
 * CIA-3 enforces the payment GATE + seller-payment recommendation).
 *
 * CIA-1 records the seller + animal + transport and assembles the traceability
 * chain (Convention 31): application → animal(ear_tag) → seller(a/c) →
 * transport(origin/dest). Ear tag must match ^\d{12}$ and is registry-unique (the
 * DB unique constraint on cia_animals.ear_tag_no enforces "same animal on
 * multiple loans" prevention now; the NDDB registry lookup lands in CIA-3).
 *
 * The payment GATE is NOT built here: CiaPurchase stays PURCHASE_INITIATED, the
 * gate inputs (vet_certified / transit_insured / cattle_insured) stay false, and
 * SELLER_PAYMENT_PENDING is unreachable in CIA-1. Geo-fence, perceptual-hash,
 * penny-drop and insurance-date integrity are CIA-3.
 */
const crypto = require('crypto');
const { emitDomainEvent } = require('../../../shared/services/domainEvents');
const { APP, PURCHASE, guardTransition } = require('../constants/ciaStatus');
const { resolveActor } = require('./context');

let db;
const getDb = () => { if (!db) db = require('../../../shared/models'); return db; };
const err = (msg, code, status = 400) => { const e = new Error(msg); e.statusCode = status; e.errorCode = code; return e; };

const loadOwnedApp = async (appUuid, actor) => {
  const { CiaApplication } = getDb();
  const app = await CiaApplication.findOne({ where: { application_uuid: appUuid } });
  if (!app) throw err('Application not found', 'CIA_APP_NOT_FOUND', 404);
  if (!actor.farmerRef || app.farmer_ref !== actor.farmerRef) throw err('Not your application', 'CIA_APP_FORBIDDEN', 403);
  return app;
};

/**
 * ★ Capture purchase evidence → PURCHASE_INITIATED. Requires the loan to be
 * disbursed (app at CATTLE_PURCHASE_PENDING — reached in CIA-2). Evidence only.
 */
const capture = async (req) => {
  const actor = await resolveActor(req);
  const app = await loadOwnedApp(req.params.appUuid, actor);
  if (app.status !== APP.CATTLE_PURCHASE_PENDING) {
    throw err(`Purchase capture needs a disbursed loan (app is ${app.status})`, 'CIA_APP_NOT_PURCHASABLE', 409);
  }
  const b = req.body || {};
  if (!/^\d{12}$/.test(b.earTagNo || '')) throw err('Ear tag must be 12 digits', 'CIA_EARTAG_INVALID', 422); // server re-validate

  const { CiaAnimal, CiaSeller, CiaTransport, CiaPurchase, sequelize } = getDb();
  try {
    return await sequelize.transaction(async (t) => {
      const animal = await CiaAnimal.create({
        animal_uuid: crypto.randomUUID(),
        ear_tag_no: b.earTagNo,                 // UNIQUE — registry-unique precursor
        ear_tag_photo_ref: b.earTagPhotoRef,
        species: b.species, breed: b.breed, sex: b.sex,
        colour_marks: b.colourMarks || null,
        photo_refs: b.photoRefs || [],          // live-capture; perceptual-hash in CIA-3
        video_ref: b.videoRef || null,
      }, { transaction: t });

      const seller = await CiaSeller.create({
        seller_uuid: crypto.randomUUID(),
        name: b.seller.name, id_proof_ref: b.seller.idProofRef,
        bank_account: b.seller.bankAccount, photo_ref: b.seller.photoRef,
        relationship_to_buyer: b.seller.relationshipToBuyer,   // circular-sale screen (CIA-3)
        account_verified: false,                                // penny-drop in CIA-3
      }, { transaction: t });

      const purchase = await CiaPurchase.create({
        purchase_uuid: crypto.randomUUID(),
        application_id: app.id, animal_id: animal.id, seller_id: seller.id,
        status: PURCHASE.PURCHASE_INITIATED,
        purchase_lat: b.purchaseGeo.lat, purchase_lng: b.purchaseGeo.lng,
        within_geofence: null,                  // CIA-3
        farmer_acknowledged: false,
        initiated_at: new Date(),
      }, { transaction: t });

      if (b.transport) {
        await CiaTransport.create({
          purchase_id: purchase.id,
          vehicle_reg_no: b.transport.vehicleRegNo, driver_name: b.transport.driverName,
          bill_ref: b.transport.billRef, challan_ref: b.transport.challanRef,
          origin_lat: b.purchaseGeo.lat, origin_lng: b.purchaseGeo.lng,
          destination_lat: b.destinationGeo ? b.destinationGeo.lat : null,
          destination_lng: b.destinationGeo ? b.destinationGeo.lng : null,
        }, { transaction: t });
      }

      guardTransition('application', app.status, APP.PURCHASE_INITIATED);
      await app.update({ status: APP.PURCHASE_INITIATED }, { transaction: t });

      await emitDomainEvent({
        eventType: 'cia.purchase.captured', aggregateType: 'CiaApplication', aggregateId: app.application_uuid,
        farmerId: actor.appUserId,
        payload: { earTagNo: b.earTagNo, sellerUuid: seller.seller_uuid, purchaseStatus: PURCHASE.PURCHASE_INITIATED },
      }, { transaction: t });

      return {
        applicationUuid: app.application_uuid,
        purchaseUuid: purchase.purchase_uuid,
        purchaseStatus: purchase.status,
        animal: { animalUuid: animal.animal_uuid, earTagNo: animal.ear_tag_no },
        seller: { sellerUuid: seller.seller_uuid },
        sellerPaymentReachable: false,          // GATE is CIA-3
      };
    });
  } catch (e) {
    if (e.name === 'SequelizeUniqueConstraintError') {
      throw err('This ear-tag number is already used for another animal', 'CIA_EARTAG_DUPLICATE', 409);
    }
    throw e;
  }
};

/** ★ Farmer confirms receipt of the animal. CIA-1 records the flag only; the
 *  delivery/insurance/payment steps (and the gate) are CIA-3. */
const acknowledge = async (req) => {
  const actor = await resolveActor(req);
  const app = await loadOwnedApp(req.params.appUuid, actor);
  const { CiaPurchase, sequelize } = getDb();
  const purchase = await CiaPurchase.findOne({ where: { application_id: app.id } });
  if (!purchase) throw err('No purchase to acknowledge', 'CIA_PURCHASE_NONE', 404);

  return sequelize.transaction(async (t) => {
    await purchase.update({ farmer_acknowledged: true }, { transaction: t });
    await emitDomainEvent({
      eventType: 'cia.delivery.acknowledged', aggregateType: 'CiaApplication', aggregateId: app.application_uuid,
      farmerId: actor.appUserId, payload: { purchaseUuid: purchase.purchase_uuid },
    }, { transaction: t });
    return { applicationUuid: app.application_uuid, purchaseUuid: purchase.purchase_uuid, farmerAcknowledged: true };
  });
};

/**
 * Owner-scoped read of the guided-purchase state — drives a resumable hub
 * (offline-first: the app shows last-synced state). Returns the coarse app view
 * plus the fine-grained CiaPurchase sub-status the app.status timeline hides.
 * `captured:false` before any capture (app still at CATTLE_PURCHASE_PENDING).
 */
const getState = async (req) => {
  const actor = await resolveActor(req);
  const app = await loadOwnedApp(req.params.appUuid, actor);
  const { CiaPurchase, CiaAnimal, CiaSeller, CiaDisbursement } = getDb();
  const purchase = await CiaPurchase.findOne({ where: { application_id: app.id } });
  const disb = await CiaDisbursement.findOne({ where: { application_id: app.id } });
  const loan = disb ? { amount: Number(disb.amount), loanAccount: disb.loan_account } : null;

  if (!purchase) {
    return {
      applicationUuid: app.application_uuid,
      appStatus: app.status,
      purchasable: app.status === APP.CATTLE_PURCHASE_PENDING,   // capture allowed once disbursed
      captured: false,
      purchaseStatus: null,
      loan,
    };
  }
  const animal = purchase.animal_id ? await CiaAnimal.findByPk(purchase.animal_id) : null;
  const seller = purchase.seller_id ? await CiaSeller.findByPk(purchase.seller_id) : null;
  return {
    applicationUuid: app.application_uuid,
    appStatus: app.status,
    purchasable: false,
    captured: true,
    purchaseStatus: purchase.status,
    farmerAcknowledged: !!purchase.farmer_acknowledged,
    deliveredAt: purchase.delivered_at || null,
    gate: {
      vetCertified: !!purchase.vet_certified,
      transitInsured: !!purchase.transit_insured,
      cattleInsured: !!purchase.cattle_insured,
    },
    cattlePolicyNo: purchase.cattle_policy_no || null,
    sellerPaymentReachable: purchase.status === PURCHASE.SELLER_PAYMENT_PENDING,
    animal: animal ? {
      earTagNo: animal.ear_tag_no,
      species: animal.species,
      breed: animal.breed,
      approvedPurchasePrice: animal.approved_purchase_price != null ? Number(animal.approved_purchase_price) : null,
    } : null,
    seller: seller ? { name: seller.name, accountVerified: !!seller.account_verified } : null,
    loan,
  };
};

module.exports = { capture, acknowledge, getState };
