/**
 * CiaDisbursement — records the bank→loan-account disbursement for an application
 * (CIA-2). Recorded, not executed. On disbursement the application becomes
 * CATTLE_PURCHASE_PENDING (the guided purchase unlocks).
 */
const { Model } = require('sequelize');
const { encField, decField } = require('../utils/fieldCrypto');

module.exports = (sequelize, DataTypes) => {
  class CiaDisbursement extends Model {
    static associate(models) {
      if (models.CiaApplication) CiaDisbursement.belongsTo(models.CiaApplication, { foreignKey: 'application_id', as: 'application' });
    }
  }
  CiaDisbursement.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    disbursement_uuid: { type: DataTypes.UUID, allowNull: false, unique: true },
    application_id: { type: DataTypes.INTEGER, allowNull: false, unique: true },
    loan_account: { type: DataTypes.STRING(255), allowNull: false, set(v) { this.setDataValue('loan_account', encField(v)); }, get() { return decField(this.getDataValue('loan_account')); } }, // encrypted at rest
    amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },      // loan component credited
    disbursement_ref: { type: DataTypes.STRING(60), allowNull: false },
    recorded_by_user_id: { type: DataTypes.INTEGER, allowNull: false },
    recorded_at: { type: DataTypes.DATE, allowNull: false },
  }, {
    sequelize, modelName: 'CiaDisbursement', tableName: 'cia_disbursements',
    timestamps: true, underscored: true,
    indexes: [{ fields: ['application_id'], unique: true }],
  });
  return CiaDisbursement;
};
