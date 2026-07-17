/**
 * CiaSanction — one row per application in a bank sanction file (non-integrated
 * mode). Unmatched rows are QUARANTINED (match_status) and never auto-applied
 * (PRD Part 17). Confirmed rows advance the application to LOAN_SANCTIONED |
 * LOAN_REJECTED under maker-checker.
 */
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class CiaSanction extends Model {
    static associate(models) {
      if (models.CiaBankBatch) CiaSanction.belongsTo(models.CiaBankBatch, { foreignKey: 'batch_id', as: 'batch' });
      if (models.CiaApplication) CiaSanction.belongsTo(models.CiaApplication, { foreignKey: 'application_id', as: 'application' });
    }
  }
  CiaSanction.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    batch_id: { type: DataTypes.INTEGER, allowNull: false },
    application_id: { type: DataTypes.INTEGER, allowNull: true }, // null until matched
    raw_row: { type: DataTypes.JSONB, allowNull: false },        // as received from the bank file
    match_status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'PENDING' }, // MATCHED|UNMATCHED|QUARANTINED
    outcome: { type: DataTypes.STRING(16), allowNull: true },    // SANCTIONED | REJECTED
    sanctioned_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
    loan_account: { type: DataTypes.STRING(34), allowNull: true },
    reject_reason: { type: DataTypes.STRING(500), allowNull: true },
    // Maker-checker + idempotency for late/duplicate files.
    file_ref: { type: DataTypes.STRING(200), allowNull: false },
    file_row_hash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    staged_by_user_id: { type: DataTypes.INTEGER, allowNull: true },
    confirmed_by_user_id: { type: DataTypes.INTEGER, allowNull: true },
    confirmed_at: { type: DataTypes.DATE, allowNull: true },
  }, {
    sequelize, modelName: 'CiaSanction', tableName: 'cia_sanctions',
    timestamps: true, underscored: true,
    indexes: [{ fields: ['batch_id'] }, { fields: ['match_status'] }],
  });
  return CiaSanction;
};
