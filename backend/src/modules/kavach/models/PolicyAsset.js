/**
 * PolicyAsset — explicit link rows; a master policy can cover many animals
 * (§5.1). Carries the 12-digit NDDB tag and the two NLM-mandated enrolment
 * photos, plus the per-animal sum insured (NLM floor rules).
 */
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class PolicyAsset extends Model {
    static associate(models) {
      if (models.InsurancePolicy) PolicyAsset.belongsTo(models.InsurancePolicy, { foreignKey: 'policy_id', as: 'policy' });
      if (models.DairyAnimal) PolicyAsset.belongsTo(models.DairyAnimal, { foreignKey: 'asset_ref_id', targetKey: 'id', as: 'animal', constraints: false });
    }
  }
  PolicyAsset.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    policy_id: { type: DataTypes.INTEGER, allowNull: false },
    asset_type: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'dairy_animal' },
    asset_ref_id: { type: DataTypes.INTEGER, allowNull: true }, // DairyAnimal.id
    tag_uid: { type: DataTypes.STRING(12), allowNull: true, validate: { is: /^\d{12}$/ } }, // NDDB ear tag
    species: { type: DataTypes.STRING(20), allowNull: true },
    valuation: { type: DataTypes.DECIMAL(15, 2), allowNull: false }, // per-animal SI
    enrol_photo_owner_url: { type: DataTypes.STRING(500), allowNull: true },
    enrol_photo_tag_url: { type: DataTypes.STRING(500), allowNull: true },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    sequelize, modelName: 'PolicyAsset', tableName: 'policy_assets',
    timestamps: true, underscored: true,
    indexes: [{ fields: ['policy_id'] }, { fields: ['tag_uid'] }],
  });
  return PolicyAsset;
};
