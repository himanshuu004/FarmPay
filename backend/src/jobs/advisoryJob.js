/**
 * advisoryJob — nightly regeneration of the deterministic advisory feed for
 * active farmers (§ advisory). Idempotent per farmer (the engine upserts OPEN
 * items and leaves farmer-disposed ones alone). Weather-dependent heat-stress
 * advisories are skipped here (no IMD feed in v1); they generate on-demand when
 * the app/device supplies temp+RH. A plain function, callable from a scheduler or test.
 */
const logger = require('../shared/utils/logger');
const advisoryEngine = require('../modules/advisory/services/advisoryEngine');

let db;
const getDb = () => { if (!db) db = require('../shared/models'); return db; };

const runAdvisoryJob = async (asOf = new Date()) => {
  const { DairyAnimal } = getDb();
  // Only farmers who actually keep a herd (advisories are register-driven).
  const rows = await DairyAnimal.findAll({ where: { is_active: true }, attributes: ['farmer_id'], group: ['farmer_id'] });
  const farmerIds = rows.map((r) => r.farmer_id).filter((x) => x != null);
  let created = 0, updated = 0;
  for (const farmerId of farmerIds) {
    const s = await advisoryEngine.generateForFarmer(farmerId, { asOf }).catch((e) => { logger.warn(`advisoryJob: farmer ${farmerId} failed: ${e.message}`); return null; });
    if (s) { created += s.created; updated += s.updated; }
  }
  const summary = { farmers: farmerIds.length, created, updated };
  logger.info(`advisoryJob: ${JSON.stringify(summary)}`);
  return summary;
};

module.exports = { runAdvisoryJob };
