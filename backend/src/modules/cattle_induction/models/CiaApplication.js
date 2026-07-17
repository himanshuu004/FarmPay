/**
 * CiaApplication — the spine of the Cattle Induction programme and the anchor of
 * the traceability chain (Convention 31). One row per farmer application; its
 * `status` follows the CIA application state machine (CLAUDE.md). Scheme version
 * is pinned at submit so in-flight apps never shift when config is re-versioned.
 */
const { Model } = require('sequelize');
const { encField, decField } = require('../utils/fieldCrypto');

module.exports = (sequelize, DataTypes) => {
  class CiaApplication extends Model {
    static associate(models) {
      if (models.CoopMembership) {
        CiaApplication.belongsTo(models.CoopMembership, { foreignKey: 'farmer_ref', targetKey: 'farmer_ref', as: 'membership' });
      }
      if (models.CiaSelectionDecision) CiaApplication.hasOne(models.CiaSelectionDecision, { foreignKey: 'application_id', as: 'selection' });
      if (models.CiaFieldVerification) CiaApplication.hasOne(models.CiaFieldVerification, { foreignKey: 'application_id', as: 'verification' });
      if (models.CiaPurchase) CiaApplication.hasOne(models.CiaPurchase, { foreignKey: 'application_id', as: 'purchase' });
      if (models.CiaDocument) CiaApplication.hasMany(models.CiaDocument, { foreignKey: 'application_id', as: 'documents' });
    }
  }
  CiaApplication.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    application_uuid: { type: DataTypes.UUID, allowNull: false, unique: true },
    // ERP identity — the join key (mirrors CoopMembership.farmer_ref).
    farmer_ref: { type: DataTypes.STRING(40), allowNull: false },
    dcs_ref: { type: DataTypes.STRING(40), allowNull: false },
    union_ref: { type: DataTypes.STRING(40), allowNull: true },   // DUSS
    user_id: { type: DataTypes.INTEGER, allowNull: true },        // app user once linked
    scheme_version: { type: DataTypes.STRING(40), allowNull: false }, // pinned at submit
    status: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'DRAFT' },
    requested_cattle_count: { type: DataTypes.INTEGER, allowNull: true },
    preferred_breed: { type: DataTypes.STRING(60), allowNull: true },
    // Financials populated in CIA-2 (bank/subsidy) — nullable at CIA-1.
    sanctioned_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
    subsidy_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
    farmer_contribution: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
    loan_account: { type: DataTypes.STRING(255), allowNull: true, set(v) { this.setDataValue('loan_account', encField(v)); }, get() { return decField(this.getDataValue('loan_account')); } }, // encrypted at rest
    milk_account_ref: { type: DataTypes.STRING(40), allowNull: true }, // loan↔milk map (recovery source; set at disbursement)
    emi_consent_ref: { type: DataTypes.STRING(60), allowNull: true }, // tri-partite consent artefact; null = track-only (Convention 33)
    moratorium_until: { type: DataTypes.DATEONLY, allowNull: true },   // repayment moratorium (PRD §7.5) — installments due on/before are shielded
    restructured_at: { type: DataTypes.DATE, allowNull: true },        // last loan restructure (PRD §7.5)
    restructure_ref: { type: DataTypes.STRING(60), allowNull: true },
    bank_batch_id: { type: DataTypes.UUID, allowNull: true }, // packet this app was submitted in
    reject_reason: { type: DataTypes.STRING(500), allowNull: true },
    scrutinised_by_user_id: { type: DataTypes.INTEGER, allowNull: true }, // DUSS maker — for maker-checker SoD at batch time
    eoi_at: { type: DataTypes.DATE, allowNull: true },
    submitted_at: { type: DataTypes.DATE, allowNull: true },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    sequelize, modelName: 'CiaApplication', tableName: 'cia_applications',
    timestamps: true, underscored: true,
    indexes: [{ fields: ['farmer_ref'] }, { fields: ['dcs_ref'] }, { fields: ['status'] }],
  });
  return CiaApplication;
};
