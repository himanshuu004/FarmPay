/**
 * CiaEmiSchedule — one planned installment of a disbursed loan's repayment
 * schedule (CIA-2). Ingested from the bank (filedrop, idempotent by
 * file_row_hash). The actual recovery (deducted/remitted/pending) is tracked
 * against these rows by the EMI ledger in the next slice.
 */
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class CiaEmiSchedule extends Model {
    static associate(models) {
      if (models.CiaApplication) CiaEmiSchedule.belongsTo(models.CiaApplication, { foreignKey: 'application_id', as: 'application' });
    }
  }
  CiaEmiSchedule.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    schedule_uuid: { type: DataTypes.UUID, allowNull: false, unique: true },
    application_id: { type: DataTypes.INTEGER, allowNull: false },
    installment_no: { type: DataTypes.INTEGER, allowNull: false },
    emi_due: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    due_date: { type: DataTypes.DATEONLY, allowNull: false },
    status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'SCHEDULED' }, // SCHEDULED|DUE|PAID|PARTIAL|OVERDUE|DEFAULT|MORATORIUM (ledger, Slice L)
    schedule_version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 }, // bumped on restructure (PRD §7.5)
    file_ref: { type: DataTypes.STRING(200), allowNull: true },
    file_row_hash: { type: DataTypes.STRING(64), allowNull: false, unique: true }, // idempotent ingest
  }, {
    sequelize, modelName: 'CiaEmiSchedule', tableName: 'cia_emi_schedules',
    timestamps: true, underscored: true,
    indexes: [
      { fields: ['application_id'] },
      { fields: ['application_id', 'installment_no'], unique: true, name: 'cia_emi_app_installment_uniq' },
    ],
  });
  return CiaEmiSchedule;
};
