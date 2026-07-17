/**
 * KccFacility — one composite KCC-AH facility per farmer. Carries the sanctioned
 * CMPL and its ST (revolving cash credit) + LT (investment) sub-limits (¶9–10).
 *
 * Society-mediated dairy-KCC lifecycle (the real cooperative-bank workflow): the
 * farmer's application is CERTIFIED by the Dairy Cooperative Society / Milk Union
 * (membership, cattle, milk supply, DBT) BEFORE the bank processes it:
 *   DRAFT → SUBMITTED → SOCIETY_CERTIFIED → UNDER_REVIEW → FORWARDED_TO_BANK
 *         → SANCTIONED → DISBURSED → ACTIVE → RENEWAL_DUE → RENEWED(→ACTIVE) → CLOSED
 *         (↘ REJECTED → DRAFT for resubmission)
 * SOCIETY_CERTIFIED is ERP-authored (the DCS Secretary works in the Aanchal ERP,
 * never in this app) — it arrives via erpSyncService, like coop order statuses.
 */
const { Model } = require('sequelize');

const STATES = [
  'DRAFT', 'SUBMITTED', 'SOCIETY_CERTIFIED', 'UNDER_REVIEW', 'FORWARDED_TO_BANK', 'SANCTIONED',
  'DISBURSED', 'ACTIVE', 'RENEWAL_DUE', 'RENEWED', 'REJECTED', 'CLOSED',
];

module.exports = (sequelize, DataTypes) => {
  class KccFacility extends Model {
    static associate(models) {
      if (models.KccFacilityActivity) KccFacility.hasMany(models.KccFacilityActivity, { foreignKey: 'facility_id', as: 'activities' });
      if (models.KccLimitSchedule) KccFacility.hasMany(models.KccLimitSchedule, { foreignKey: 'facility_id', as: 'schedule' });
      if (models.KccDrawdownRequest) KccFacility.hasMany(models.KccDrawdownRequest, { foreignKey: 'facility_id', as: 'drawdowns' });
      if (models.User) KccFacility.belongsTo(models.User, { foreignKey: 'farmer_id', as: 'farmer' });
    }
  }
  KccFacility.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    facility_uuid: { type: DataTypes.UUID, allowNull: false, unique: true },
    farmer_id: { type: DataTypes.INTEGER, allowNull: false },
    scheme_version: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'KCC_DIR_2026' },
    state_code: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'UK' },
    status: { type: DataTypes.ENUM(...STATES), allowNull: false, defaultValue: 'DRAFT' },
    // Computed limits (from the engine).
    mpl_year1: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
    mpl_final: { type: DataTypes.DECIMAL(14, 2), allowNull: true },   // 6th-year ST MPL
    investment_total: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
    cmpl: { type: DataTypes.DECIMAL(14, 2), allowNull: true },        // = mpl_final + investment_total
    st_sublimit: { type: DataTypes.DECIMAL(14, 2), allowNull: true }, // revolving CC (= mpl_final)
    lt_sublimit: { type: DataTypes.DECIMAL(14, 2), allowNull: true }, // investment (= investment_total)
    collateral_free: { type: DataTypes.BOOLEAN, allowNull: true },    // CMPL ≤ collateral-free limit
    collateral_free_limit_applied: { type: DataTypes.INTEGER, allowNull: true }, // ₹2L base or ₹3L tie-up
    tieup_certified: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }, // milk-union tie-up → ₹3L (¶23)
    // Farmer-authored KCC-form fields (workflow steps 4–6): DBT account, tie-up
    // request, and the KYC checklist the farmer confirms is ready for society/bank
    // verification. The society CERTIFIES these; the app only captures them.
    bank_account_ref: { type: DataTypes.STRING(64), allowNull: true },            // DCCB/cooperative savings a/c for DBT + disbursement
    tieup_requested: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }, // farmer asks for the milk-union tie-up (→ ₹3L)
    kyc_ready: { type: DataTypes.JSONB, allowNull: true },                        // { pan, aadhaar, land, photo } booleans
    repayment_consent: { type: DataTypes.JSONB, allowNull: true },                // { tripartite, noCostService } — enables 3% subvention
    selected_animal_uuids: { type: DataTypes.JSONB, allowNull: true },            // KCC raised against these specific animals (null = whole herd)
    computed_at: { type: DataTypes.DATE, allowNull: true },
    sanctioned_at: { type: DataTypes.DATE, allowNull: true },
    next_review_at: { type: DataTypes.DATEONLY, allowNull: true },    // annual review (¶28)
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    sequelize, modelName: 'KccFacility', tableName: 'kcc_facilities',
    timestamps: true, underscored: true,
  });
  KccFacility.STATES = STATES;
  return KccFacility;
};
