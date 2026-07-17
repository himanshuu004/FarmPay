/**
 * Money helpers. All rupee math rounds to 2 decimals to avoid float drift.
 */

/** Round to 2 decimal places (nearest paisa). */
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** Round DOWN to the nearest whole rupee (used for conservative limits). */
const floorRupee = (n) => Math.floor(Number(n));

module.exports = { round2, floorRupee };
