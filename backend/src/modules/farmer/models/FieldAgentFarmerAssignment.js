/**
 * FieldAgentFarmerAssignment Model
 * Tracks which farmers are assigned to which field agents.
 */

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class FieldAgentFarmerAssignment extends Model {
    static associate(models) {
      FieldAgentFarmerAssignment.belongsTo(models.FieldAgentProfile, { foreignKey: 'field_agent_profile_id', as: 'agentProfile' });
      FieldAgentFarmerAssignment.belongsTo(models.User, { foreignKey: 'farmer_id', as: 'farmer' });
    }
  }

  FieldAgentFarmerAssignment.init(
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      field_agent_profile_id: {
        type: DataTypes.INTEGER, allowNull: false,
        references: { model: 'field_agent_profiles', key: 'id' },
      },
      farmer_id: {
        type: DataTypes.INTEGER, allowNull: false,
        references: { model: 'users', key: 'id' },
      },
      lgd_village_id: { type: DataTypes.INTEGER, allowNull: true },
      assigned_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
      assigned_by: { type: DataTypes.INTEGER, allowNull: true },
      unassigned_at: { type: DataTypes.DATE, allowNull: true },
      unassigned_by: { type: DataTypes.INTEGER, allowNull: true },
      is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    {
      sequelize, modelName: 'FieldAgentFarmerAssignment', tableName: 'field_agent_farmer_assignments',
      timestamps: true, underscored: true,
      indexes: [
        { fields: ['field_agent_profile_id', 'is_active'], name: 'idx_agent_assignment_active' },
        { fields: ['farmer_id', 'is_active'], name: 'idx_farmer_assignment_active' },
      ],
    }
  );

  return FieldAgentFarmerAssignment;
};
