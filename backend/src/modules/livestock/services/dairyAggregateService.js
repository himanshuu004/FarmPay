/**
 * Dairy Aggregate Service — Persona phase save-and-lock
 *
 * Supports the setup-dairy.tsx screen in the farmer app. The farmer enters
 * aggregate counts ({ cows, buffaloes, mixed, avgDailyMilkLiters }) and we
 * create N placeholder rows in `dairy_animals` so the downstream per-animal
 * screens (dairy-animals, dairy-logbook, treatment, etc.) have something
 * to render without forcing the farmer through N individual add-animal
 * forms on day one.
 *
 * Idempotent — if called again with new counts, reconciles:
 *   - adds new placeholder rows to match the new total per type,
 *   - soft-deletes (is_active=false) any placeholder rows above the new total,
 *   - leaves named animals (those the farmer later renamed in the detail
 *     screen) alone — they take precedence in the "keep" list.
 *
 * On successful save, flips the farmer's DAIRY activity subscription
 * setup_complete = true via activitySubscriptionService.
 */

const { v4: uuidv4 } = require('uuid');
const logger = require('../../../shared/utils/logger');

let db;
const getDb = () => { if (!db) db = require('../../../shared/models'); return db; };

// Placeholder names by species, e.g. "Cow 1", "Buffalo 2"
const placeholderName = (kind, idx) => `${kind} ${idx}`;

const KIND_MAP = {
  cows:      { legacyType: 'cow',     species: 'CATTLE',  label: 'Cow' },
  buffaloes: { legacyType: 'buffalo', species: 'BUFFALO', label: 'Buffalo' },
  mixed:     { legacyType: 'cow',     species: 'CATTLE',  label: 'Mixed' },
};

/**
 * @param {number} farmerId
 * @param {{ cows?: number, buffaloes?: number, mixed?: number, avgDailyMilkLiters?: number }} aggregates
 */
const saveAggregateHerd = async (farmerId, aggregates) => {
  const { DairyAnimal, sequelize } = getDb();

  const counts = {
    cows:      Math.max(0, parseInt(aggregates.cows || 0, 10)),
    buffaloes: Math.max(0, parseInt(aggregates.buffaloes || 0, 10)),
    mixed:     Math.max(0, parseInt(aggregates.mixed || 0, 10)),
  };

  const results = { created: 0, kept: 0, softDeleted: 0 };

  await sequelize.transaction(async (t) => {
    for (const [kind, cfg] of Object.entries(KIND_MAP)) {
      const target = counts[kind];

      // Existing active rows for this (farmer, species) — ordered so that
      // named rows sort LAST, i.e. we reconcile un-named placeholders first.
      const existing = await DairyAnimal.findAll({
        where: { farmer_id: farmerId, species: cfg.species, is_active: true, status: 'ACTIVE' },
        order: [
          // Named animals (name IS NOT NULL) sort last, get preserved
          [sequelize.literal('CASE WHEN name IS NULL THEN 0 ELSE 1 END'), 'ASC'],
          ['id', 'ASC'],
        ],
        transaction: t,
      });

      const currentCount = existing.length;

      if (currentCount < target) {
        // Add (target - currentCount) placeholder rows
        const toCreate = target - currentCount;
        for (let i = 1; i <= toCreate; i++) {
          await DairyAnimal.create({
            animal_uuid: uuidv4(),
            farmer_id: farmerId,
            animal_type: cfg.legacyType,
            species: cfg.species,
            gender: 'FEMALE',
            name: null, // un-named placeholder; farmer renames later
            status: 'ACTIVE',
            acquisition_mode: 'PURCHASED',
            current_lifecycle_stage: 'EARLY_LACTATION',
            is_active: true,
          }, { transaction: t });
          results.created += 1;
        }
        results.kept += currentCount;
      } else if (currentCount > target) {
        // Soft-delete the excess — but preserve named rows. Since we sorted
        // unnamed first, slicing from the end gives us the named ones to keep.
        const toSoftDelete = existing.slice(target).filter((r) => !r.name);
        for (const row of toSoftDelete) {
          row.is_active = false;
          row.exit_date = new Date();
          row.exit_reason = 'aggregate_herd_reconciliation';
          await row.save({ transaction: t });
          results.softDeleted += 1;
        }
        results.kept += existing.length - toSoftDelete.length;
      } else {
        results.kept += currentCount;
      }
    }
  });

  // Flip the DAIRY activity subscription setup_complete flag
  try {
    const activitySubscriptionService = require('../../../farmer/services/activitySubscriptionService');
    await activitySubscriptionService.markActivitySetupComplete(farmerId, 'DAIRY');
  } catch (err) {
    logger.warn(`markActivitySetupComplete(DAIRY) failed for farmer ${farmerId}: ${err.message}`);
  }

  const totalAnimals = counts.cows + counts.buffaloes + counts.mixed;
  logger.info(`Dairy aggregate saved for farmer ${farmerId}: ${totalAnimals} animals (created=${results.created}, kept=${results.kept}, softDeleted=${results.softDeleted})`);

  return {
    totalAnimals,
    counts,
    avgDailyMilkLiters: aggregates.avgDailyMilkLiters || null,
    reconciliation: results,
  };
};

module.exports = { saveAggregateHerd };
