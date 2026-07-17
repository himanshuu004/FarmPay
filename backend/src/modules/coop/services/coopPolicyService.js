/**
 * CoopPolicy service — reads the active ordering policy (70% factor + demand
 * windows) and answers "is a demand window open right now?".
 *
 * Config, never code (CLAUDE.md #5): values come from the coop_policy table;
 * DEFAULTS here are only the fallback when the table is empty.
 */
const crypto = require('crypto');

let db;
const getDb = () => { if (!db) db = require('../../../shared/models'); return db; };

const DEFAULTS = {
  scope: 'DEFAULT',
  order_limit_factor: 0.70,
  min_consistency: 0.50,
  demand_windows: [
    { label: 'WEEK_1', fromDay: 1, toDay: 7 },
    { label: 'WEEK_3', fromDay: 15, toDay: 21 },
  ],
  currency: 'INR',
  version: 'COOP_POLICY_V1',
};

/** Ensure a DEFAULT policy row exists; returns it. */
const ensureDefaultPolicy = async () => {
  const { CoopPolicy } = getDb();
  const [row] = await CoopPolicy.findOrCreate({
    where: { scope: 'DEFAULT' },
    defaults: { policy_uuid: crypto.randomUUID(), ...DEFAULTS },
  });
  return row;
};

/** Active policy for a scope, as plain numbers. Falls back to DEFAULTS. */
const getPolicy = async (scope = 'DEFAULT') => {
  const { CoopPolicy } = getDb();
  const row =
    (scope !== 'DEFAULT' && (await CoopPolicy.findOne({ where: { scope, is_active: true } }))) ||
    (await CoopPolicy.findOne({ where: { scope: 'DEFAULT', is_active: true } }));
  if (!row) return { ...DEFAULTS };
  return {
    scope: row.scope,
    order_limit_factor: Number(row.order_limit_factor),
    min_consistency: Number(row.min_consistency),
    demand_windows: row.demand_windows,
    currency: row.currency,
    version: row.version,
  };
};

/**
 * Is `date` inside a demand window? Order SUBMISSION is gated on this.
 * @returns {{ open:boolean, window:object|null, nextWindow:object|null }}
 */
const demandWindowStatus = (policy, date = new Date()) => {
  const day = date.getDate();
  const windows = policy.demand_windows || DEFAULTS.demand_windows;
  const open = windows.find((w) => day >= w.fromDay && day <= w.toDay) || null;
  // The next window that starts strictly after today (this month), if any.
  const upcoming = windows
    .filter((w) => w.fromDay > day)
    .sort((a, b) => a.fromDay - b.fromDay)[0] || null;
  return { open: !!open, window: open, nextWindow: open ? null : upcoming };
};

module.exports = { ensureDefaultPolicy, getPolicy, demandWindowStatus, DEFAULTS };
