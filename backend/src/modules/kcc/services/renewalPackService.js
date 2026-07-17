/**
 * KCC renewal / application pack — THE BANKER INTERFACE IN V1 (CLAUDE.md #28,
 * blueprint §11). The live banker dashboard is Phase 4; until then the sanction/
 * renewal deliverable is a generated document assembled deterministically from
 * the facility, its activities (units LIVE from registers), the 6-year schedule,
 * the latest drawing-power snapshot (¶16(4) receivables evidence) and any LT
 * drawdowns.
 *
 * `buildPack` returns the structured payload (the source of truth); `renderHtml`
 * renders a print-ready A4 document. No binary-PDF dependency is pulled in —
 * "generated documents first"; the HTML is print-to-PDF from any browser and is
 * the same content a Phase-4 renderer would consume.
 */
const drawdownService = require('./kccDrawdownService');
const drawingPowerService = require('./kccDrawingPowerService');

let db;
const getDb = () => { if (!db) db = require('../../../shared/models'); return db; };

const err = (msg, code, status = 400) => { const e = new Error(msg); e.statusCode = status; e.errorCode = code; return e; };

const rupee = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Assemble the full pack payload for a facility. */
const buildPack = async (facilityUuid) => {
  const { KccFacility, KccFacilityActivity, KccLimitSchedule, User, FarmerProfile } = getDb();

  const facility = await KccFacility.findOne({ where: { facility_uuid: facilityUuid } });
  if (!facility) throw err('Facility not found', 'KCC_FACILITY_NOT_FOUND', 404);

  const [activities, schedule, drawdownView, dpSnap, user] = await Promise.all([
    KccFacilityActivity.findAll({ where: { facility_id: facility.id }, order: [['activity_code', 'ASC']] }),
    KccLimitSchedule.findAll({ where: { facility_id: facility.id }, order: [['year_index', 'ASC']] }),
    drawdownService.list(facilityUuid),
    drawingPowerService.latest(facilityUuid),
    User ? User.findByPk(facility.farmer_id) : null,
  ]);
  const profile = FarmerProfile ? await FarmerProfile.findOne({ where: { farmer_id: facility.farmer_id } }) : null;

  const isRenewal = ['RENEWAL_DUE', 'RENEWED', 'ACTIVE'].includes(facility.status);

  return {
    kind: isRenewal ? 'RENEWAL_PACK' : 'APPLICATION_PACK',
    generatedAt: new Date().toISOString(),
    scheme: { version: facility.scheme_version, stateCode: facility.state_code },
    facility: {
      uuid: facility.facility_uuid, status: facility.status,
      cmpl: Number(facility.cmpl), stSubLimit: Number(facility.st_sublimit),
      ltSubLimit: Number(facility.lt_sublimit), investmentTotal: Number(facility.investment_total),
      mplYear1: Number(facility.mpl_year1), mplFinal: Number(facility.mpl_final),
      collateralFree: facility.collateral_free,
      sanctionedAt: facility.sanctioned_at, nextReviewAt: facility.next_review_at,
    },
    farmer: {
      name: user ? [user.first_name, user.last_name].filter(Boolean).join(' ') : null,
      mobile: user ? user.mobile : null, userRef: user ? user.user_id : null,
      profileRef: profile ? profile.profile_uuid : null,
    },
    activities: activities.map((a) => ({
      code: a.activity_code, units: Number(a.units), unitType: a.unit_type,
      sofByYear: a.sof_by_year_snapshot,
    })),
    schedule: schedule.map((s) => ({
      year: s.year_index, wcTotal: Number(s.wc_total), mpl: Number(s.mpl),
      drawingLimit: Number(s.drawing_limit), breakdown: s.breakdown,
    })),
    drawingPower: dpSnap ? {
      asOf: dpSnap.snapshot_date, value: Number(dpSnap.drawing_power),
      stocks: Number(dpSnap.stocks_value), milkReceivables: Number(dpSnap.milk_receivables),
      otherReceivables: Number(dpSnap.other_receivables), stCap: dpSnap.st_limit_cap != null ? Number(dpSnap.st_limit_cap) : null,
    } : null,
    ltDrawdowns: {
      headroom: drawdownView.headroom,
      requests: drawdownView.requests.map((r) => ({
        item: r.item, description: r.description, amount: Number(r.amount), status: r.status,
        disbursedAt: r.disbursed_at,
      })),
    },
  };
};

/** Deterministic, print-ready HTML document (A4). */
const renderHtml = (pack) => {
  const f = pack.facility;
  const title = pack.kind === 'RENEWAL_PACK' ? 'KCC-AH Renewal Pack' : 'KCC-AH Application Pack';
  const scheduleRows = pack.schedule.map((s) => `
    <tr><td>${s.year}</td><td class="r">${rupee(s.wcTotal)}</td><td class="r">${rupee(s.mpl)}</td><td class="r">${rupee(s.drawingLimit)}</td></tr>`).join('');
  const activityRows = pack.activities.map((a) => `
    <tr><td>${esc(a.code)}</td><td class="r">${a.units} ${esc(a.unitType)}</td></tr>`).join('');
  const drawdownRows = pack.ltDrawdowns.requests.map((r) => `
    <tr><td>${esc(r.item)}</td><td>${esc(r.description)}</td><td class="r">${rupee(r.amount)}</td><td>${esc(r.status)}</td></tr>`).join('') ||
    '<tr><td colspan="4" class="muted">No LT drawdowns</td></tr>';
  const dp = pack.drawingPower;

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  @page { size: A4; margin: 18mm; }
  body { font: 12px/1.5 -apple-system, Segoe UI, Roboto, sans-serif; color: #1a1a1a; }
  h1 { font-size: 18px; margin: 0 0 2px; }
  h2 { font-size: 13px; margin: 18px 0 6px; border-bottom: 1px solid #ccc; padding-bottom: 3px; }
  .sub { color: #666; margin: 0 0 14px; }
  table { width: 100%; border-collapse: collapse; margin: 4px 0; }
  th, td { text-align: left; padding: 5px 8px; border-bottom: 1px solid #eee; }
  th { background: #f5f5f5; font-weight: 600; }
  td.r, th.r { text-align: right; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; }
  .kv { display: flex; justify-content: space-between; border-bottom: 1px dotted #ddd; padding: 3px 0; }
  .kv b { font-weight: 600; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 3px; background: #e6f4ea; color: #137333; font-size: 11px; }
  .muted { color: #999; }
  .foot { margin-top: 24px; color: #888; font-size: 10px; }
</style></head><body>
  <h1>${esc(title)}</h1>
  <p class="sub">${esc(pack.scheme.version)} · ${esc(pack.scheme.stateCode)} · Facility ${esc(f.uuid)} · Status ${esc(f.status)}</p>

  <h2>Applicant</h2>
  <div class="grid">
    <div class="kv"><span>Name</span><b>${esc(pack.farmer.name) || '—'}</b></div>
    <div class="kv"><span>Mobile</span><b>${esc(pack.farmer.mobile) || '—'}</b></div>
    <div class="kv"><span>Farmer ref</span><b>${esc(pack.farmer.userRef) || '—'}</b></div>
    <div class="kv"><span>Profile</span><b>${esc(pack.farmer.profileRef) || '—'}</b></div>
  </div>

  <h2>Sanctioned limit</h2>
  <div class="grid">
    <div class="kv"><span>Composite MPL (CMPL)</span><b>${rupee(f.cmpl)}</b></div>
    <div class="kv"><span>ST sub-limit (cash credit)</span><b>${rupee(f.stSubLimit)}</b></div>
    <div class="kv"><span>LT sub-limit (investment)</span><b>${rupee(f.ltSubLimit)}</b></div>
    <div class="kv"><span>Year-1 MPL</span><b>${rupee(f.mplYear1)}</b></div>
    <div class="kv"><span>6th-year MPL</span><b>${rupee(f.mplFinal)}</b></div>
    <div class="kv"><span>Collateral-free</span><b>${f.collateralFree ? '<span class="badge">Yes (≤ ₹2 lakh)</span>' : 'No'}</b></div>
  </div>

  <h2>Activities (units live from registers)</h2>
  <table><thead><tr><th>Activity</th><th class="r">Eligible units</th></tr></thead><tbody>${activityRows}</tbody></table>

  <h2>6-year limit schedule</h2>
  <table><thead><tr><th>Year</th><th class="r">WC total</th><th class="r">MPL</th><th class="r">Drawing limit</th></tr></thead><tbody>${scheduleRows}</tbody></table>

  <h2>Drawing power (¶16(4) — receivables evidence)</h2>
  ${dp ? `<div class="grid">
    <div class="kv"><span>As of</span><b>${esc(dp.asOf)}</b></div>
    <div class="kv"><span>Drawing power</span><b>${rupee(dp.value)}</b></div>
    <div class="kv"><span>Stocks</span><b>${rupee(dp.stocks)}</b></div>
    <div class="kv"><span>Milk receivables (co-op)</span><b>${rupee(dp.milkReceivables)}</b></div>
    <div class="kv"><span>Other receivables</span><b>${rupee(dp.otherReceivables)}</b></div>
    <div class="kv"><span>Capped at ST sub-limit</span><b>${dp.stCap != null ? rupee(dp.stCap) : '—'}</b></div>
  </div>` : '<p class="muted">No drawing-power snapshot recorded.</p>'}

  <h2>LT drawdowns (investment credit)</h2>
  <p class="sub">Headroom: ${rupee(pack.ltDrawdowns.headroom.available)} of ${rupee(pack.ltDrawdowns.headroom.ceiling)} · committed ${rupee(pack.ltDrawdowns.headroom.committed)}</p>
  <table><thead><tr><th>Item</th><th>Description</th><th class="r">Amount</th><th>Status</th></tr></thead><tbody>${drawdownRows}</tbody></table>

  <p class="foot">Generated ${esc(pack.generatedAt)} · Allied KCC · Statutory limit math per RBI KCC Directions 2026; co-op input credit is NOT part of this limit. This document is the banker interface for v1.</p>
</body></html>`;
};

const generate = async (facilityUuid) => {
  const pack = await buildPack(facilityUuid);
  return { pack, html: renderHtml(pack) };
};

module.exports = { buildPack, renderHtml, generate };
