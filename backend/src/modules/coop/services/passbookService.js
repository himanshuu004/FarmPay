/**
 * Passbook service — THE WEDGE surface (blueprint §1.1).
 *
 * The milk passbook is the only daily-pull screen, built from the ERP mirror
 * with ZERO farmer data entry. In mock mode (no filedrop yet) we hydrate the
 * mirror from the ERP mock so the wedge is demoable end-to-end. Every response
 * carries an honest `asOf` / `freshness` label (filedrop = "as of yesterday").
 *
 * Best-effort Redis cache (coop:passbook:<ref>, 30m) — never blocks on Redis.
 */
const crypto = require('crypto');
const { erp } = require('../../../integrations');
const { round2 } = require('../../../shared/utils/moneyHelper');
const { computeEligibility } = require('./eligibilityService');

let db;
const getDb = () => { if (!db) db = require('../../../shared/models'); return db; };

// Best-effort cache helpers — swallow Redis errors so logic never depends on it.
// Bypassed entirely under tests for deterministic, cross-run-clean behaviour.
const cache = require('../../../config/redis');
const CACHE_ON = process.env.NODE_ENV !== 'test';
const safeGet = async (k) => { if (!CACHE_ON) return null; try { return await cache.getKey(k); } catch { return null; } };
const safeSet = async (k, v, ttl) => { if (!CACHE_ON) return; try { await cache.setWithTTL(k, v, ttl); } catch { /* noop */ } };
const safeDel = async (k) => { if (!CACHE_ON) return; try { await cache.deleteKeys(k); } catch { /* noop */ } };

/**
 * Hydrate coop_milk_snapshots from the ERP mock when the mirror is empty.
 * Real deployments get these via filedrop/webhook; this keeps mock mode live.
 */
const hydrateFromErpIfEmpty = async (farmerRef) => {
  const { CoopMilkSnapshot, CoopMembership } = getDb();
  const count = await CoopMilkSnapshot.count({ where: { farmer_ref: farmerRef } });
  if (count > 0) return;
  const summary = await erp.getMilkSummary(farmerRef, 6).catch(() => null);
  if (!summary) return;
  const membership = await CoopMembership.findOne({ where: { farmer_ref: farmerRef } });
  const societyRef = membership ? membership.society_ref : null;
  const total = summary.monthly.length;
  for (let i = 0; i < total; i++) {
    const m = summary.monthly[i];
    // Outstanding applies to the latest month; earlier months already adjusted.
    const outstanding = i === total - 1 ? summary.totalValue - summary.monthly.slice(0, -1).reduce((s, x) => s + x.value, 0) : 0;
    await CoopMilkSnapshot.findOrCreate({
      where: { farmer_ref: farmerRef, period: m.month },
      defaults: {
        snapshot_uuid: crypto.randomUUID(),
        farmer_ref: farmerRef, society_ref: societyRef, period: m.month,
        litres: m.litres, value: m.value, avg_fat_pct: m.avgFatPct,
        outstanding: i === total - 1 ? await erp.getOutstandingInputBalance(farmerRef).catch(() => outstanding) : 0,
        as_of_date: m.month + '-28',
        source_mode: erp.getMode(),
      },
    });
  }
};

/** Build the passbook view for a member. */
const getPassbook = async (farmerRef, societyRef = 'DEFAULT') => {
  const key = `coop:passbook:${farmerRef}`;
  const cached = await safeGet(key);
  if (cached) return cached;

  await hydrateFromErpIfEmpty(farmerRef);

  const { CoopMilkSnapshot } = getDb();
  const snaps = await CoopMilkSnapshot.findAll({
    where: { farmer_ref: farmerRef },
    order: [['period', 'ASC']],
  });

  const months = snaps.map((s) => ({
    period: s.period,
    litres: Number(s.litres),
    value: round2(Number(s.value)),
    avgFatPct: s.avg_fat_pct != null ? Number(s.avg_fat_pct) : null,
    asOf: s.as_of_date,
  }));
  const latest = snaps[snaps.length - 1] || null;
  const eligibility = await computeEligibility(farmerRef, societyRef);
  // Freshness reflects how the DISPLAYED data arrived, not the adapter's mode.
  const sourceMode = latest ? latest.source_mode : erp.getMode();

  const view = {
    farmerRef,
    months,
    totalValue: round2(months.reduce((s, m) => s + m.value, 0)),
    totalLitres: round2(months.reduce((s, m) => s + m.litres, 0)),
    outstandingPayables: eligibility.outstandingPayables,
    availableOrderLimit: eligibility.availableLimit,   // the 70% meter's fill
    grossOrderLimit: eligibility.grossLimit,
    inFlightOrders: eligibility.inFlightOrders,
    asOf: latest ? latest.as_of_date : null,
    sourceMode,
    freshness: sourceMode === 'filedrop' ? 'as of yesterday' : 'live',
  };
  await safeSet(key, view, 1800);
  return view;
};

/** Invalidate the passbook + eligibility cache after a mirror/order change. */
const invalidate = async (farmerRef) => {
  await safeDel(`coop:passbook:${farmerRef}`);
  await safeDel(`coop:elig:${farmerRef}`);
};

module.exports = { getPassbook, invalidate, hydrateFromErpIfEmpty };
