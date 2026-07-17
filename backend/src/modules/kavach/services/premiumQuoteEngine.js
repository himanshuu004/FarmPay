/**
 * NLM premium / subsidy engine — the deterministic statutory core of KAVACH
 * (INSURANCE-SYSTEM-DESIGN §7.1; CLAUDE.md NLM constants). LIVESTOCK line only.
 *
 * Pure arithmetic, no I/O — the insurance analog of the KCC Limit Engine: this
 * is scheme math, NEVER a model (CLAUDE.md #20). All scheme parameters are
 * injected (config, never code #5); NLM_DEFAULTS below is only the fallback that
 * the seeded plan / scheme_config overrides.
 *
 *   premium_total = premiumRatePct × sum_insured            (rate ≤ statutory ceiling)
 *   farmer_share  = 15% × premium_total                      (NLM beneficiary share)
 *   govt_share    = premium_total − farmer_share             (85%)
 *   govt split    = centre:state per region                  (60:40 · 90:10 NER/Himalayan)
 *
 * Sum insured is market value, floored by milk yield (₹3,000/litre cow,
 * ₹4,000/litre buffalo). A household may insure ≤ 10 cattle-units (5 for
 * pig/rabbit); 1 CU = 1 large animal = 10 sheep/goat/pig/rabbit.
 */
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// Uttarakhand qualifies as Himalayan (HIM). Statutory NLM fallbacks (Jan 2025 OG).
const NLM_DEFAULTS = {
  farmerSharePct: 15,
  // Total-premium ceiling as % of SI, by region and term (months).
  ceilings: {
    NORMAL: { 12: 4.5, 24: 8, 36: 11 },
    HIM: { 12: 5.5, 24: 9, 36: 11.5 },
    NER: { 12: 5.5, 24: 9, 36: 11.5 },
  },
  // Centre:state split of the 85% government share.
  govtSplit: {
    NORMAL: { centre: 60, state: 40 },
    HIM: { centre: 90, state: 10 },
    NER: { centre: 90, state: 10 },
  },
  cuCapDefault: 10,                       // cattle-units per household
  cuCapBySpecies: { PIG: 5, RABBIT: 5 },  // pig/rabbit household cap
  cuPerAnimal: { CATTLE: 1, BUFFALO: 1, YAK: 1, MITHUN: 1, CAMEL: 1, GOAT: 0.1, SHEEP: 0.1, PIG: 0.1, RABBIT: 0.1 },
  siFloorPerLitre: { CATTLE: 3000, BUFFALO: 4000 }, // NLM SI floors, per litre/day
  waitingPeriodDays: 21,
};

const err = (msg, code) => { const e = new Error(msg); e.statusCode = 400; e.errorCode = code; return e; };

const regionOf = (r) => {
  const v = String(r || 'NORMAL').toUpperCase();
  return ['HIM', 'NER', 'NORMAL'].includes(v) ? v : 'NORMAL';
};

/**
 * @param {object} input
 *   species            'CATTLE'|'BUFFALO'|'GOAT'|'SHEEP'|'PIG'|'RABBIT'|...
 *   marketValue        assessed market value per animal (₹)
 *   milkLitresPerDay?  if given, applies the NLM SI floor (cow/buffalo)
 *   termMonths         12 | 24 | 36 (NLM default 36)
 *   region             'HIM'|'NER'|'NORMAL' (Uttarakhand → HIM)
 *   animals            count in this enrolment (default 1)
 *   premiumRatePct?    plan's actuarial rate; capped at the statutory ceiling
 *   existingCuUsed?    household CU already insured (for the cap check)
 *   scheme?            partial override of NLM_DEFAULTS
 */
const computeNlmPremium = (input) => {
  const s = { ...NLM_DEFAULTS, ...(input.scheme || {}) };
  const species = String(input.species || '').toUpperCase();
  const region = regionOf(input.region);
  const term = Number(input.termMonths || 36);
  const animals = Number(input.animals || 1);

  if (!species) throw err('species is required', 'KAVACH_SPECIES_REQUIRED');
  const ceilingByTerm = s.ceilings[region];
  if (!ceilingByTerm || ceilingByTerm[term] == null) throw err(`No NLM ceiling for ${region}/${term}mo`, 'KAVACH_CEILING_MISSING');
  if (!(animals > 0)) throw err('animals must be positive', 'KAVACH_ANIMALS_INVALID');

  // Sum insured (per animal) = max(market value, milk-yield floor).
  const floorRate = s.siFloorPerLitre[species] || 0;
  const floorSi = input.milkLitresPerDay ? floorRate * Number(input.milkLitresPerDay) : 0;
  const marketValue = Number(input.marketValue || 0);
  if (!(marketValue > 0) && !(floorSi > 0)) throw err('marketValue or milkLitresPerDay required', 'KAVACH_SI_REQUIRED');
  const sumInsuredPerAnimal = round2(Math.max(marketValue, floorSi));
  const sumInsured = round2(sumInsuredPerAnimal * animals);

  // Premium rate: plan rate capped at the statutory ceiling (never above).
  const ceiling = ceilingByTerm[term];
  const premiumRatePct = input.premiumRatePct != null ? Math.min(Number(input.premiumRatePct), ceiling) : ceiling;

  const premiumTotal = round2((premiumRatePct / 100) * sumInsured);
  const farmerShare = round2((s.farmerSharePct / 100) * premiumTotal);
  const govtShare = round2(premiumTotal - farmerShare);
  const split = s.govtSplit[region];
  const govtCentre = round2((split.centre / 100) * govtShare);
  const govtState = round2(govtShare - govtCentre);

  // Cattle-unit cap (per household).
  const cuPerAnimal = s.cuPerAnimal[species] != null ? s.cuPerAnimal[species] : 1;
  const cuConsumed = round2(cuPerAnimal * animals);
  const cuCap = s.cuCapBySpecies[species] || s.cuCapDefault;
  const existingCu = round2(Number(input.existingCuUsed || 0));
  const cuTotal = round2(existingCu + cuConsumed);
  const cuCapOk = cuTotal <= cuCap;

  return {
    species, region, termMonths: term, animals,
    sumInsuredPerAnimal, sumInsured, siFloorApplied: floorSi > marketValue && floorSi > 0,
    premiumRatePct, statutoryCeilingPct: ceiling,
    premiumTotal, farmerShare, govtShare, govtCentre, govtState,
    cu: { perAnimal: cuPerAnimal, consumed: cuConsumed, existing: existingCu, total: cuTotal, cap: cuCap, ok: cuCapOk },
    waitingPeriodDays: s.waitingPeriodDays,
  };
};

module.exports = { computeNlmPremium, NLM_DEFAULTS };
