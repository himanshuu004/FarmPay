/**
 * CiaEmiConsent — the tri-partite (farmer–society–bank) authorisation that lets
 * the app INITIATE milk-payment EMI deductions (Convention 33; open-question #1).
 * DPDP: purpose-bound (emi_deduction), timestamped, revocable. History is kept —
 * revoke marks a row REVOKED; the latest ACTIVE row (if any) governs the mode.
 * The exact legal wording is UCDF/legal's; this records the artefact + reference.
 */
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class CiaEmiConsent extends Model {
    static associate(models) {
      if (models.CiaApplication) CiaEmiConsent.belongsTo(models.CiaApplication, { foreignKey: 'application_id', as: 'application' });
    }
  }
  CiaEmiConsent.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    consent_uuid: { type: DataTypes.UUID, allowNull: false, unique: true },
    application_id: { type: DataTypes.INTEGER, allowNull: false },
    farmer_ref: { type: DataTypes.STRING(40), allowNull: false },
    society_ref: { type: DataTypes.STRING(40), allowNull: false },
    bank_ref: { type: DataTypes.STRING(40), allowNull: true },
    authorisation_ref: { type: DataTypes.STRING(120), allowNull: false }, // legal deed / e-sign ref
    purpose: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'emi_deduction' },
    channel: { type: DataTypes.STRING(16), allowNull: true }, // app|ivr|paper
    status: { type: DataTypes.STRING(12), allowNull: false, defaultValue: 'ACTIVE' }, // ACTIVE|REVOKED
    consented_at: { type: DataTypes.DATE, allowNull: false },
    revoked_at: { type: DataTypes.DATE, allowNull: true },
    recorded_by_user_id: { type: DataTypes.INTEGER, allowNull: true },
  }, {
    sequelize, modelName: 'CiaEmiConsent', tableName: 'cia_emi_consents',
    timestamps: true, underscored: true,
    indexes: [{ fields: ['application_id'] }, { fields: ['application_id', 'status'] }],
  });
  return CiaEmiConsent;
};
