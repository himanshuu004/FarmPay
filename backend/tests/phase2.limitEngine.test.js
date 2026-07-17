/**
 * KCC Limit Engine — RBI Annex I fixture tests.
 *
 * These reproduce the two worked illustrations to the rupee. If either drifts,
 * the engine is WRONG (statutory math is never approximate). No DB — pure math.
 */
const { computeKccLimit, roundHalfUpRupee, roundNearest1000 } = require('../src/modules/kcc/services/limitEngine');

describe('rounding primitives', () => {
  test('half-up to rupee matches the illustrations’ starred rounds', () => {
    expect(roundHalfUpRupee(24756.6)).toBe(24757);   // dairy Y4
    expect(roundHalfUpRupee(352049.5)).toBe(352050); // fishery Y4
    expect(roundHalfUpRupee(425980.5)).toBe(425981); // fishery Y6
  });
  test('nearest ₹1,000 for drawing limits', () => {
    expect(roundNearest1000(275200)).toBe(275000);
    expect(roundNearest1000(291200)).toBe(291000);
  });
});

describe('Illustration 1(B) — Dairy (2 cross-bred cows)', () => {
  const res = computeKccLimit({
    activities: [{
      code: 'DAIRY',
      units: 2,
      sofByYear: [7000, 7500, 8000, 8600, 9500, 10200],
      insuranceByYear: [400, 450, 500, 550, 600, 650],
    }],
  });

  test('Year-1 working-capital breakdown', () => {
    const y1 = res.yearly[0];
    expect(y1.sumWc).toBe(14000);       // 7000 × 2
    expect(y1.consumption).toBe(1400);  // 10%
    expect(y1.maintenance).toBe(2800);  // 20%
    expect(y1.insurance).toBe(400);
    expect(y1.wcTotal).toBe(18600);     // A + B
  });

  test('MPL series → ₹18,600 … ₹29,956 (Y6)', () => {
    expect(res.mpl).toEqual([18600, 20460, 22506, 24757, 27233, 29956]);
    expect(res.mplFinal).toBe(29956);
  });

  test('CMPL adds investment credit', () => {
    const withInvest = computeKccLimit({
      activities: [{ code: 'DAIRY', units: 2, sofByYear: [7000, 7500, 8000, 8600, 9500, 10200], insuranceByYear: [400, 450, 500, 550, 600, 650] }],
      investmentItems: [{ item: 'SHED', amount: 50000 }],
    });
    expect(withInvest.cmpl).toBe(29956 + 50000);
  });
});

describe('Illustration 2(B) — Fishery (1-acre pond)', () => {
  const res = computeKccLimit({
    activities: [{
      code: 'FISHERY',
      units: 1,
      sofByYear: [200000, 208000, 220000, 235000, 250000, 260000],
      insuranceByYear: [4500, 4800, 5200, 5600, 6100, 6600],
    }],
    investmentItems: [{ item: 'HARVESTER', amount: 150000 }, { item: 'POND_RENOVATION', amount: 50000 }],
  });

  test('Year-1 working-capital breakdown', () => {
    const y1 = res.yearly[0];
    expect(y1.sumWc).toBe(200000);
    expect(y1.consumption).toBe(20000);
    expect(y1.maintenance).toBe(40000);
    expect(y1.insurance).toBe(4500);
    expect(y1.wcTotal).toBe(264500);
  });

  test('MPL series → ₹2,64,500 … ₹4,25,981 (Y6)', () => {
    expect(res.mpl).toEqual([264500, 290950, 320045, 352050, 387255, 425981]);
    expect(res.mplFinal).toBe(425981);
  });

  test('CMPL = MPL(6) + Σ investment = ₹6,25,981', () => {
    expect(res.investmentTotal).toBe(200000);
    expect(res.cmpl).toBe(425981 + 200000); // 625981
  });

  test('drawing limits (per §IV) recompute per year', () => {
    // Y2 raw = 208000 + 20800 + 41600 + 4800 = 275200
    expect(res.yearly[1].drawingLimitRaw).toBe(275200);
  });
});

describe('Composite dedup rules (¶16(3))', () => {
  test('10% consumption is computed ONCE over the combined WC, not per activity', () => {
    const res = computeKccLimit({
      activities: [
        { code: 'DAIRY', units: 2, sofByYear: Array(6).fill(7000) },
        { code: 'GOATERY', units: 10, sofByYear: Array(6).fill(1000) },
      ],
    });
    const y1 = res.yearly[0];
    expect(y1.sumWc).toBe(14000 + 10000);       // 24000 combined
    expect(y1.consumption).toBe(2400);          // 10% of 24000, once
    expect(y1.maintenance).toBe(4800);          // 20% of 24000
  });
});
