/**
 * CiaSubsidyTransfer — records the DUSS→bank subsidy transfer for an application
 * (CIA-2). The app RECORDS this financial event (it does not move money). Every
 * transfer is reconcilable: farmer ↔ subsidy ↔ sanction ↔ loan account.
 */
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class CiaSubsidyTransfer extends Model {
    static associate(models) {
      if (models.CiaApplication) CiaSubsidyTransfer.belongsTo(models.CiaApplication, { foreignKey: 'application_id', as: 'application' });
    }
  }
  CiaSubsidyTransfer.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    transfer_uuid: { type: DataTypes.UUID, allowNull: false, unique: true },
    application_id: { type: DataTypes.INTEGER, allowNull: false, unique: true },
    amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    transfer_ref: { type: DataTypes.STRING(60), allowNull: false },   // bank/UTR reference
    bank_ref: { type: DataTypes.STRING(40), allowNull: true },
    recorded_by_user_id: { type: DataTypes.INTEGER, allowNull: false },
    recorded_at: { type: DataTypes.DATE, allowNull: false },
  }, {
    sequelize, modelName: 'CiaSubsidyTransfer', tableName: 'cia_subsidy_transfers',
    timestamps: true, underscored: true,
    indexes: [{ fields: ['application_id'], unique: true }],
  });
  return CiaSubsidyTransfer;
};
