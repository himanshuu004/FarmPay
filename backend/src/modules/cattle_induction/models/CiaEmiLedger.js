/**
 * CiaEmiLedger — the reconciled recovery state for one installment (CIA-2). Built
 * by reconciling ERP milk-payment deductions against the CiaEmiSchedule:
 *   pending = emi_due − amount_deducted, classified PAID|PARTIAL|OVERDUE|DEFAULT|DUE.
 * One row per (application, installment); re-reconciling updates it in place.
 */
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class CiaEmiLedger extends Model {
    static associate(models) {
      if (models.CiaApplication) CiaEmiLedger.belongsTo(models.CiaApplication, { foreignKey: 'application_id', as: 'application' });
    }
  }
  CiaEmiLedger.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    ledger_uuid: { type: DataTypes.UUID, allowNull: false, unique: true },
    application_id: { type: DataTypes.INTEGER, allowNull: false },
    installment_no: { type: DataTypes.INTEGER, allowNull: false },
    emi_due: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    amount_deducted: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    amount_remitted: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    claim_adjusted: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 }, // insurance-claim proceeds applied to this installment (CIA-4); preserved across reconcile sweeps
    reversed_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 }, // bank reversal / refund netted against amount_deducted
    carried_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 }, // prepayment surplus carried in from earlier installments (config-gated)
    pending_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'DUE' }, // DUE|PAID|PARTIAL|OVERDUE|DEFAULT
    reconciled_at: { type: DataTypes.DATE, allowNull: true },
    source_ref: { type: DataTypes.STRING(200), allowNull: true }, // settlement file / ERP feed ref
  }, {
    sequelize, modelName: 'CiaEmiLedger', tableName: 'cia_emi_ledger',
    timestamps: true, underscored: true,
    indexes: [
      { fields: ['application_id'] },
      { fields: ['application_id', 'installment_no'], unique: true, name: 'cia_emi_ledger_app_installment_uniq' },
    ],
  });
  return CiaEmiLedger;
};
