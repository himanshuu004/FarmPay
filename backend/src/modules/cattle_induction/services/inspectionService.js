/**
 * CIA post-purchase inspection service (CIA-4). Schedules 7/30/90-day inspections
 * from delivery and records them: asset-existence (ear-tag re-confirm + live
 * re-photo of the SAME animal), health, and milk-yield vs the valued yield.
 * Mismatches raise SHADOW flags (SUBSTITUTION_SUSPECTED / YIELD_SHORTFALL) that
 * surface on the fraud panel — never an auto-rejection (Convention 32).
 */
const crypto = require('crypto');
const { emitDomainEvent } = require('../../../shared/services/domainEvents');
const { resolveActor } = require('./context');

let db;
const getDb = () => { if (!db) db = require('../../../shared/models'); return db; };
const err = (msg, code, status = 400) => { const e = new Error(msg); e.statusCode = status; e.errorCode = code; return e; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
const DEFAULT_DAYS = [7, 30, 90];

/** Schedule the 7/30/90-day inspections for a delivered purchase (idempotent). */
const scheduleFor = async (app, purchase, { days = DEFAULT_DAYS, deliveredAt } = {}) => {
  const { CiaPostPurchaseInspection } = getDb();
  const base = deliveredAt || purchase.delivered_at;
  if (!base) return { scheduled: 0 };
  let scheduled = 0;
  for (const day of days) {
    // eslint-disable-next-line no-await-in-loop
    const [, created] = await CiaPostPurchaseInspection.findOrCreate({
      where: { application_id: app.id, due_day: day },
      defaults: { inspection_uuid: crypto.randomUUID(), application_id: app.id, purchase_id: purchase.id, due_day: day, due_date: addDays(base, day), status: 'SCHEDULED' },
    });
    if (created) scheduled += 1;
  }
  return { scheduled };
};

/** Field (supervisor/vet): record an inspection for a given due day. */
const recordInspection = async (req) => {
  const actor = await resolveActor(req);
  if (!actor.appUserId) throw err('Unknown inspector', 'CIA_ACTOR_UNKNOWN', 401);
  const { CiaApplication, CiaPurchase, CiaAnimal, CiaPostPurchaseInspection, CiaSchemeConfig, sequelize } = getDb();
  const b = req.body || {};

  const app = await CiaApplication.findOne({ where: { application_uuid: req.params.appUuid } });
  if (!app) throw err('Application not found', 'CIA_APP_NOT_FOUND', 404);
  const inspection = await CiaPostPurchaseInspection.findOne({ where: { application_id: app.id, due_day: b.dueDay } });
  if (!inspection) throw err(`No scheduled ${b.dueDay}-day inspection`, 'CIA_INSPECTION_NONE', 404);
  if (inspection.status === 'DONE') throw err('Inspection already recorded', 'CIA_INSPECTION_DONE', 409);

  const purchase = await CiaPurchase.findByPk(inspection.purchase_id);
  const animal = purchase && purchase.animal_id ? await CiaAnimal.findByPk(purchase.animal_id) : null;
  const scheme = await CiaSchemeConfig.findOne({ where: { scheme_version: app.scheme_version } });
  const rules = (scheme && scheme.rules_json) || {};

  const earTagConfirmed = /^\d{12}$/.test(b.earTagNo || '');
  const earTagMatch = Boolean(earTagConfirmed && animal && b.earTagNo === animal.ear_tag_no);
  const photos = Array.isArray(b.photoRefs) ? b.photoRefs : [];
  const assetExists = earTagMatch && photos.length >= 1;

  const flags = [];
  if (earTagConfirmed && !earTagMatch) flags.push('SUBSTITUTION_SUSPECTED');
  const valued = animal && animal.daily_milk_yield != null ? Number(animal.daily_milk_yield) : 0;
  const ratio = Number(rules.postPurchaseYieldMinRatio || 0.7);
  if (valued > 0 && b.milkYield != null && Number(b.milkYield) < valued * ratio) flags.push('YIELD_SHORTFALL');

  return sequelize.transaction(async (t) => {
    await inspection.update({
      status: 'DONE', inspected_by_user_id: actor.appUserId, inspected_at: new Date(),
      ear_tag_confirmed: earTagConfirmed, ear_tag_match: earTagMatch, asset_exists: assetExists,
      photos, healthy: b.healthy != null ? b.healthy : null, milk_yield: b.milkYield != null ? b.milkYield : null,
      exception_flags: flags.length ? flags : null,
    }, { transaction: t });

    // A suspected substitution surfaces on the fraud panel (shadow), never blocks silently.
    if (flags.includes('SUBSTITUTION_SUSPECTED') && purchase) {
      const existing = Array.isArray(purchase.exception_flags) ? purchase.exception_flags : [];
      if (!existing.includes('SUBSTITUTION_SUSPECTED')) {
        await purchase.update({ exception_flags: [...existing, 'SUBSTITUTION_SUSPECTED'] }, { transaction: t });
      }
    }
    await emitDomainEvent({
      eventType: 'cia.inspection.recorded', aggregateType: 'CiaApplication', aggregateId: app.application_uuid,
      farmerId: null, payload: { dueDay: b.dueDay, assetExists, earTagMatch, flags, by: actor.appUserId },
    }, { transaction: t });

    return { applicationUuid: app.application_uuid, dueDay: b.dueDay, assetExists, earTagMatch, exceptionFlags: flags };
  });
};

module.exports = { scheduleFor, recordInspection, DEFAULT_DAYS };
