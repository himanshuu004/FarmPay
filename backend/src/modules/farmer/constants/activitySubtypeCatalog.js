/**
 * Activity Subtype Catalog
 *
 * Single source of truth for sub-type picker options inside each ROOTS
 * activity. Shared by the backend validator and the farmer mobile app
 * (imported via a mirrored TS file — keep these in sync when editing).
 *
 * Scope: only activities that need a NEW sub-type picker. DAIRY and
 * FISHERY already carry their equivalent sub-dimension in profile tables
 * (FarmerDairyProfile.herd_tier, FarmerFisheryProfile.operation_type)
 * so they're intentionally absent here.
 *
 *   CROP     → rice / wheat / sugarcane / oilseeds / pulses  (multi)
 *   HORTI    → fruits / vegetables / flowers                 (multi)
 *   POULTRY  → broiler / layer                               (multi)
 *   GOATERY  → stall_fed / grazing                           (multi)
 *
 * All four are multi-select with minRequired: 1. No mutual exclusion —
 * a farmer may rotate rice+wheat+pulses, run broiler+layer in separate
 * sheds, keep goats stall-fed in monsoon + grazing in summer, etc.
 */

const ACTIVITY_SUBTYPE_CATALOG = {
  CROP: {
    multiSelect: true,
    minRequired: 1,
    subtypes: [
      { code: 'rice',      labelEn: 'Rice',      labelHi: 'धान',    icon: '🌾' },
      { code: 'wheat',     labelEn: 'Wheat',     labelHi: 'गेहूं',    icon: '🌾' },
      { code: 'sugarcane', labelEn: 'Sugarcane', labelHi: 'गन्ना',   icon: '🎋' },
      { code: 'oilseeds',  labelEn: 'Oilseeds',  labelHi: 'तिलहन',  icon: '🌻' },
      { code: 'pulses',    labelEn: 'Pulses',    labelHi: 'दलहन',    icon: '🫘' },
    ],
  },
  HORTI: {
    multiSelect: true,
    minRequired: 1,
    subtypes: [
      { code: 'fruits',     labelEn: 'Fruits',     labelHi: 'फल',      icon: '🍎' },
      { code: 'vegetables', labelEn: 'Vegetables', labelHi: 'सब्जियां', icon: '🥬' },
      // Flowers reuses the HORTI (orchard) PoP for now. TODO: add a
      // dedicated FLOWER PoP seeder (marigold/rose/jasmine cycle).
      { code: 'flowers',    labelEn: 'Flowers',    labelHi: 'फूल',     icon: '🌸' },
    ],
  },
  POULTRY: {
    multiSelect: true,
    minRequired: 1,
    subtypes: [
      { code: 'broiler', labelEn: 'Broiler', labelHi: 'ब्रॉयलर', icon: '🍗' },
      { code: 'layer',   labelEn: 'Layer',   labelHi: 'लेयर',   icon: '🥚' },
    ],
  },
  GOATERY: {
    multiSelect: true,
    minRequired: 1,
    subtypes: [
      { code: 'stall_fed', labelEn: 'Stall-fed', labelHi: 'बाड़े में', icon: '🏠' },
      { code: 'grazing',   labelEn: 'Grazing',   labelHi: 'चराई',     icon: '🌿' },
    ],
  },
};

const SUPPORTED_ACTIVITY_CODES = Object.keys(ACTIVITY_SUBTYPE_CATALOG);

/** Returns the list of valid subtype codes for an activity, or [] if unknown. */
const getSubtypeCodes = (activityCode) =>
  (ACTIVITY_SUBTYPE_CATALOG[activityCode]?.subtypes || []).map((s) => s.code);

/** Returns true if (activityCode, subtypeCode) is a valid combination. */
const isValidSubtype = (activityCode, subtypeCode) =>
  getSubtypeCodes(activityCode).includes(subtypeCode);

module.exports = {
  ACTIVITY_SUBTYPE_CATALOG,
  SUPPORTED_ACTIVITY_CODES,
  getSubtypeCodes,
  isValidSubtype,
};
