/**
 * KccSocietyCertification — the Dairy Cooperative Society / Milk Union's
 * certification that gates a society-mediated dairy KCC (the real cooperative-bank
 * workflow). The DCS Secretary certifies, in the Aanchal ERP, that the farmer:
 *   1. is a member of the society / milk union,
 *   2. owns the certified number of cattle,
 *   3. supplies milk to the union,
 *   4. is paid by DBT into the KCC-linked bank account.
 *
 * A milk-union tie-up (no intermediaries) unlocks the ₹3-lakh collateral-free
 * limit (¶23). ERP-authored — never edited in this app.
 */
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class KccSocietyCertification extends Model {
    static associate(models) {
      if (models.KccFacility) KccSocietyCertification.belongsTo(models.KccFacility, { foreignKey: 'facility_id', as: 'facility' });
    }
  }
  KccSocietyCertification.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    certification_uuid: { type: DataTypes.UUID, allowNull: false, unique: true },
    facility_id: { type: DataTypes.INTEGER, allowNull: false },
    membership_ref: { type: DataTypes.STRING(40), allowNull: true },   // coop farmer_ref
    milk_union_ref: { type: DataTypes.STRING(40), allowNull: true },
    member_certified: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    cattle_count_certified: { type: DataTypes.INTEGER, allowNull: true },
    milk_supply_certified: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    dbt_to_account_certified: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    bank_account_ref: { type: DataTypes.STRING(40), allowNull: true }, // DCCB savings a/c
    tieup_agreement: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }, // no-intermediary tie-up → ₹3L
    certified_by: { type: DataTypes.STRING(80), allowNull: true },     // DCS Secretary / ERP ref
    certified_at: { type: DataTypes.DATE, allowNull: true },
    source_mode: { type: DataTypes.STRING(12), allowNull: true },      // erp mode: live|webhook|filedrop|mock
  }, {
    sequelize, modelName: 'KccSocietyCertification', tableName: 'kcc_society_certifications',
    timestamps: true, underscored: true,
    indexes: [{ fields: ['facility_id'], unique: true }, { fields: ['membership_ref'] }],
  });
  return KccSocietyCertification;
};
