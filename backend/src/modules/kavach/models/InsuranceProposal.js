/**
 * InsuranceProposal — a captured-once enrolment intent before it becomes a
 * policy (§5.1). Carries the NLM 6-state enrolment machine (CLAUDE.md, which is
 * authoritative over the doc's simpler status list):
 *
 *   DRAFT → TAGGED → EXAMINED(VO) → VALUED → PAID → POLICY_ISSUED
 *           (↘ REJECTED at any stage)
 *
 * asset_ref_id points at the DairyAnimal register row (no re-typing #6).
 */
const { Model } = require('sequelize');

const STATES = ['DRAFT', 'TAGGED', 'EXAMINED', 'VALUED', 'PAID', 'POLICY_ISSUED', 'REJECTED'];
const CHANNELS = ['self', 'posp', 'bank']; // no csc/sathi (out of scope)
const ASSET_TYPES = ['dairy_animal']; // livestock line only

module.exports = (sequelize, DataTypes) => {
  class InsuranceProposal extends Model {
    static associate(models) {
      if (models.InsurancePlan) InsuranceProposal.belongsTo(models.InsurancePlan, { foreignKey: 'plan_id', as: 'plan' });
      if (models.InsurancePolicy) InsuranceProposal.hasOne(models.InsurancePolicy, { foreignKey: 'proposal_id', as: 'policy' });
      if (models.User) InsuranceProposal.belongsTo(models.User, { foreignKey: 'farmer_id', as: 'farmer' });
    }
  }
  InsuranceProposal.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    proposal_uuid: { type: DataTypes.UUID, allowNull: false, unique: true },
    farmer_id: { type: DataTypes.INTEGER, allowNull: false },
    plan_id: { type: DataTypes.INTEGER, allowNull: false },
    asset_type: { type: DataTypes.ENUM(...ASSET_TYPES), allowNull: false, defaultValue: 'dairy_animal' },
    asset_ref_id: { type: DataTypes.INTEGER, allowNull: true }, // DairyAnimal.id
    tag_uid: { type: DataTypes.STRING(12), allowNull: true }, // 12-digit NDDB ear tag ^\d{12}$
    channel: { type: DataTypes.ENUM(...CHANNELS), allowNull: false, defaultValue: 'self' },
    posp_id: { type: DataTypes.INTEGER, allowNull: true }, // POSP attribution
    species: { type: DataTypes.STRING(20), allowNull: true },
    market_value: { type: DataTypes.DECIMAL(15, 2), allowNull: true },
    sum_insured: { type: DataTypes.DECIMAL(15, 2), allowNull: true },
    premium_total: { type: DataTypes.DECIMAL(15, 2), allowNull: true },
    premium_farmer: { type: DataTypes.DECIMAL(15, 2), allowNull: true },
    consent_record_id: { type: DataTypes.INTEGER, allowNull: true }, // DPDP consent
    // Premium-via-KCC decision, captured at PAID and carried into issuance (¶32–33).
    financed_on_kcc: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    kcc_facility_uuid: { type: DataTypes.STRING(36), allowNull: true },
    premium_reference: { type: DataTypes.STRING(120), allowNull: true },
    status: { type: DataTypes.ENUM(...STATES), allowNull: false, defaultValue: 'DRAFT' },
    // enrolment evidence (the 2 NLM photos captured at TAGGED)
    enrol_photo_owner_url: { type: DataTypes.STRING(500), allowNull: true },
    enrol_photo_tag_url: { type: DataTypes.STRING(500), allowNull: true },
    examined_by: { type: DataTypes.INTEGER, allowNull: true }, // VET user id
    rejection_reason: { type: DataTypes.STRING(255), allowNull: true },
    submitted_at: { type: DataTypes.DATE, allowNull: true },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    sequelize, modelName: 'InsuranceProposal', tableName: 'insurance_proposals',
    timestamps: true, underscored: true,
    indexes: [{ fields: ['farmer_id'] }, { fields: ['status'] }],
  });
  InsuranceProposal.STATES = STATES;
  InsuranceProposal.CHANNELS = CHANNELS;
  return InsuranceProposal;
};
