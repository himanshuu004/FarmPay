/**
 * Farmer Soil Health Card Service
 * One active SHC per farmer (FarmerPay-owned). Captured during onboarding.
 * Photo + GPS + structured chemistry fields.
 */

const logger = require('../../../shared/utils/logger');

let db;
const getDb = () => {
  if (!db) db = require('../../../shared/models');
  return db;
};

/**
 * Upsert the farmer's soil health card. Persists numeric/enum fields,
 * optional photo URL + capture timestamp, optional GPS, and stamps
 * farmer_profiles.shc_status = 'captured'.
 */
const upsertSoilHealthCard = async (farmerId, payload) => {
  const { FarmerSoilHealthCard, FarmerProfile } = getDb();

  const fields = [
    'photo_url', 'photo_captured_at',
    'latitude', 'longitude', 'location_accuracy_m',
    'soil_type',
    'ph', 'ec', 'organic_carbon',
    'nitrogen_n', 'phosphorus_p', 'potassium_k',
    'sulphur_s', 'zinc_zn', 'boron_b', 'iron_fe', 'manganese_mn', 'copper_cu',
    'source', 'card_issue_date', 'card_reference_no', 'raw_ocr_text',
  ];
  const data = { farmer_id: farmerId };
  for (const f of fields) {
    if (payload[f] !== undefined) data[f] = payload[f];
  }
  if (!data.source) data.source = 'manual_entry';

  const existing = await FarmerSoilHealthCard.findOne({ where: { farmer_id: farmerId } });
  let row;
  if (existing) {
    await existing.update(data);
    row = existing;
  } else {
    row = await FarmerSoilHealthCard.create(data);
  }

  await FarmerProfile.update(
    { shc_status: 'captured' },
    { where: { farmer_id: farmerId } }
  );

  logger.info(`SHC upserted for farmer ${farmerId} (id=${row.id})`);
  return row;
};

/**
 * Get the farmer's current SHC, or null if none.
 */
const getSoilHealthCard = async (farmerId) => {
  const { FarmerSoilHealthCard } = getDb();
  return FarmerSoilHealthCard.findOne({ where: { farmer_id: farmerId } });
};

/**
 * Mark the SHC step as skipped on the farmer profile.
 */
const markSkipped = async (farmerId) => {
  const { FarmerProfile } = getDb();
  await FarmerProfile.update(
    { shc_status: 'skipped' },
    { where: { farmer_id: farmerId } }
  );
  logger.info(`SHC marked skipped for farmer ${farmerId}`);
  return { shcStatus: 'skipped' };
};

module.exports = {
  upsertSoilHealthCard,
  getSoilHealthCard,
  markSkipped,
};
