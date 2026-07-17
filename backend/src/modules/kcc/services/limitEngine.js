/**
 * KCC Composite Limit Engine — the core new IP (blueprint §5; RBI Directions 2026).
 *
 * DETERMINISTIC FOREVER. Statutory math is never a model (CLAUDE.md #20). This
 * module is pure — no DB, no I/O — so it can be exhaustively fixture-tested
 * against the two RBI worked illustrations (Annex I) which ARE the unit tests.
 *
 * Per year n, for a composite of allied activities:
 *   WC_activity(n) = SoF(activity, n) × eligible_units(activity)      (units live from registers)
 *   ΣWC(n)         = Σ WC_activity(n)
 *   consumption(n) = consumptionPct × ΣWC(n)     # 10%, ONCE across all activities (¶16(3))
 *   maintenance(n) = maintenancePct × ΣWC(n)     # 20%
 *   insurance(n)   = Σ insurance_type(n)          # each insurance TYPE once (¶16(3))
 *   WC_total(n)    = ΣWC(n) + consumption(n) + maintenance(n) + insurance(n)
 *
 * MPL (Maximum Permissible Limit, for documentation) — the series CMPL uses:
 *   MPL(1) = WC_total(1)
 *   MPL(n) = roundHalfUpRupee( MPL(n-1) × (1 + escalationPct) )        # 10%/yr escalation
 *
 * Drawing limit for subsequent seasons (§IV) recomputes each year from that
 * year's SoF + %s + that year's insurance (informational; rounded to ₹1,000).
 *
 * CMPL = MPL(tenure) + Σ investment_credit_items                       # LT sub-limit
 *
 * Verified to reproduce EXACTLY:
 *   Illustration 1(B) dairy   : Y1 ₹18,600  → Y6 MPL ₹29,956
 *   Illustration 2(B) fishery : Y1 ₹2,64,500 → Y6 MPL ₹4,25,981
 */

/** Round half-up to the nearest rupee (RBI illustration rounding). */
const roundHalfUpRupee = (x) => Math.floor(x + 0.5);
/** Round to nearest ₹1,000 (drawing-limit convention). */
const roundNearest1000 = (x) => Math.round(x / 1000) * 1000;

const DEFAULT_SCHEME = Object.freeze({
  code: 'KCC_DIR_2026',
  consumptionPct: 0.10, // ¶16 — 10%, once across activities
  maintenancePct: 0.20, // ¶16 — 20%
  escalationPct: 0.10,  // ¶13(6) — 10%/yr
  tenureYears: 6,       // ¶8 — 6-year composite tenure
});

/**
 * @param {object} input
 *   activities: [{ code, units, sofByYear:number[tenure], insuranceByYear?:number[tenure] }]
 *     - insuranceByYear is per insurance TYPE; each activity contributes its own type once.
 *   investmentItems?: [{ item, amount }]   // LT investment credit (animals, sheds, equipment)
 *   scheme?: partial override of DEFAULT_SCHEME
 * @returns {{ scheme, yearly:Array, mpl:number[], mplFinal:number, drawingLimits:number[],
 *             investmentTotal:number, cmpl:number }}
 */
const computeKccLimit = (input) => {
  const scheme = { ...DEFAULT_SCHEME, ...(input.scheme || {}) };
  const T = scheme.tenureYears;
  const activities = input.activities || [];
  if (activities.length === 0) throw new Error('limitEngine: at least one activity required');

  // Validate SoF schedules cover the tenure.
  for (const a of activities) {
    if (!Array.isArray(a.sofByYear) || a.sofByYear.length < T) {
      throw new Error(`limitEngine: activity ${a.code} needs sofByYear of length ${T}`);
    }
  }

  // ── Year-1 working-capital assessment (drives MPL(1)) ──────────────
  const yearBreakdown = (n) => {
    const wcActivities = activities.map((a) => ({
      code: a.code,
      units: a.units,
      sof: a.sofByYear[n - 1],
      wc: a.sofByYear[n - 1] * a.units,
    }));
    const sumWc = wcActivities.reduce((s, x) => s + x.wc, 0);
    const consumption = scheme.consumptionPct * sumWc; // once across all activities
    const maintenance = scheme.maintenancePct * sumWc;
    const insurance = activities.reduce(
      (s, a) => s + ((a.insuranceByYear && a.insuranceByYear[n - 1]) || 0), 0
    );
    const wcTotal = sumWc + consumption + maintenance + insurance;
    return { year: n, wcActivities, sumWc, consumption, maintenance, insurance, wcTotal };
  };

  const y1 = yearBreakdown(1);

  // ── MPL series: MPL(1)=WC_total(1); MPL(n)=roundHalfUp(MPL(n-1)×1.10) ──
  const mpl = [];
  mpl[0] = roundHalfUpRupee(y1.wcTotal); // Y1 (whole rupees in the illustrations)
  for (let n = 2; n <= T; n++) {
    mpl[n - 1] = roundHalfUpRupee(mpl[n - 2] * (1 + scheme.escalationPct));
  }

  // ── Drawing limits (informational, per §IV): recompute each year ──
  const drawingLimits = [];
  const yearly = [];
  for (let n = 1; n <= T; n++) {
    const b = yearBreakdown(n);
    drawingLimits[n - 1] = roundNearest1000(b.wcTotal);
    yearly.push({ ...b, mpl: mpl[n - 1], drawingLimitRaw: b.wcTotal, drawingLimit: drawingLimits[n - 1] });
  }

  // ── CMPL = MPL(tenure) + Σ investment credit ──────────────────────
  const investmentTotal = (input.investmentItems || []).reduce((s, x) => s + (x.amount || 0), 0);
  const mplFinal = mpl[T - 1];
  const cmpl = mplFinal + investmentTotal;

  return {
    scheme: scheme.code,
    yearly,
    mpl,
    mplFinal,
    drawingLimits,
    investmentTotal,
    cmpl,
  };
};

module.exports = { computeKccLimit, roundHalfUpRupee, roundNearest1000, DEFAULT_SCHEME };
