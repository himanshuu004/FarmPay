/**
 * CiaSelectionDecision — DCS Board decision for an application (in-app; the
 * Convention 30 exception). SELECTED requires a resolution doc; NOT_SELECTED
 * requires a reason (PRD Part 8/17). Attributable + immutable via domain_events.
 */
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class CiaSelectionDecision extends Model {
    static associate(models) {
      if (models.CiaApplication) CiaSelectionDecision.belongsTo(models.CiaApplication, { foreignKey: 'application_id', as: 'application' });
    }
  }
  CiaSelectionDecision.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    application_id: { type: DataTypes.INTEGER, allowNull: false, unique: true },
    decision: { type: DataTypes.STRING(16), allowNull: false }, // SELECTED | NOT_SELECTED
    reason: { type: DataTypes.STRING(500), allowNull: true },
    resolution_doc_ref: { type: DataTypes.STRING(200), allowNull: true }, // content-addressed minutes
    decided_by_user_id: { type: DataTypes.INTEGER, allowNull: false },    // board member attribution
    decided_at: { type: DataTypes.DATE, allowNull: false },
  }, {
    sequelize, modelName: 'CiaSelectionDecision', tableName: 'cia_selection_decisions',
    timestamps: true, underscored: true,
  });
  return CiaSelectionDecision;
};
