/**
 * Dairy Profile Service
 * Manages the per-farmer dairy profile — tier selection (SMALL/MEDIUM/LARGE),
 * cooperative info, default payment mode. Created at dairy onboarding and
 * drives the tiered UX (entry mode) on the mobile app.
 */

const { v4: uuidv4 } = require('uuid');
const logger = require('../../../shared/utils/logger');

let db;
const getDb = () => {
  if (!db) db = require('../../../shared/models');
  return db;
};

const deriveTier = (animalCount) => {
  if (animalCount == null) return 'SMALL';
  if (animalCount < 5) return 'SMALL';
  if (animalCount <= 10) return 'MEDIUM';
  return 'LARGE';
};

const deriveEntryMode = (tier) => (tier === 'LARGE' ? 'WEEKLY_BULK' : 'TRANSACTIONAL');

/**
 * Creates or updates the dairy profile for a farmer.
 * Called on dairy onboarding (tier picker screen).
 */
const upsertProfile = async (farmerId, data) => {
  const { FarmerDairyProfile } = getDb();

  let profile = await FarmerDairyProfile.findOne({ where: { farmer_id: farmerId } });

  // Partial-patch friendly: on update we preserve the existing tier when
  // neither herdTier nor expectedAnimalCount is sent, so the in-context
  // micro-prompt in farm.tsx can upsert with just `{ herdTier }` and the
  // reverse — a cooperative-info update — won't silently flip tier to SMALL.
  const tier =
    data.herdTier ||
    (data.expectedAnimalCount != null ? deriveTier(data.expectedAnimalCount) : profile?.herd_tier) ||
    'SMALL';
  const entryMode = data.entryMode || profile?.entry_mode || deriveEntryMode(tier);

  if (profile) {
    await profile.update({
      herd_tier: tier,
      entry_mode: entryMode,
      cooperative_name: data.cooperativeName ?? profile.cooperative_name,
      cooperative_member_id: data.cooperativeMemberId ?? profile.cooperative_member_id,
      default_payment_mode: data.defaultPaymentMode ?? profile.default_payment_mode,
      currency: data.currency ?? profile.currency,
    });
  } else {
    profile = await FarmerDairyProfile.create({
      profile_uuid: uuidv4(),
      farmer_id: farmerId,
      herd_tier: tier,
      entry_mode: entryMode,
      cooperative_name: data.cooperativeName || null,
      cooperative_member_id: data.cooperativeMemberId || null,
      default_payment_mode: data.defaultPaymentMode || 'CASH',
      currency: data.currency || 'INR',
    });
    logger.info(`Dairy profile created for farmer ${farmerId} (tier=${tier})`);
  }

  return profile;
};

const getProfile = async (farmerId) => {
  const { FarmerDairyProfile } = getDb();
  return FarmerDairyProfile.findOne({ where: { farmer_id: farmerId } });
};

/**
 * Recomputes tier when herd size changes. Called by animal service after
 * add/exit events so the entry-mode stays in sync with reality.
 */
const recomputeTier = async (farmerId) => {
  const { FarmerDairyProfile, DairyAnimal } = getDb();
  const count = await DairyAnimal.count({
    where: { farmer_id: farmerId, status: 'ACTIVE', is_active: true },
  });
  const tier = deriveTier(count);
  const profile = await FarmerDairyProfile.findOne({ where: { farmer_id: farmerId } });
  if (profile && profile.herd_tier !== tier) {
    await profile.update({ herd_tier: tier, entry_mode: deriveEntryMode(tier) });
    logger.info(`Dairy tier recomputed for farmer ${farmerId}: ${tier} (count=${count})`);
  }
  return { tier, animalCount: count };
};

module.exports = { upsertProfile, getProfile, recomputeTier, deriveTier };
