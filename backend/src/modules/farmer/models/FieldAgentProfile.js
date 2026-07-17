/**
 * FieldAgentProfile Model
 * Sathi field agent identity, service area, and contact info.
 */

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class FieldAgentProfile extends Model {
    static associate(models) {
      FieldAgentProfile.belongsTo(models.User, { foreignKey: 'agent_user_id', as: 'user' });
      FieldAgentProfile.hasMany(models.FieldAgentFarmerAssignment, { foreignKey: 'field_agent_profile_id', as: 'assignments' });
    }
  }

  FieldAgentProfile.init(
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      agent_user_id: {
        type: DataTypes.INTEGER, allowNull: false, unique: true,
        references: { model: 'users', key: 'id' },
      },
      agent_code: { type: DataTypes.STRING(20), allowNull: false, unique: true },
      field_agent_name: { type: DataTypes.STRING(120), allowNull: false },
      lgd_state_id: { type: DataTypes.INTEGER, allowNull: true },
      lgd_district_id: { type: DataTypes.INTEGER, allowNull: true },
      lgd_block_id: { type: DataTypes.INTEGER, allowNull: true },
      service_radius_km: { type: DataTypes.INTEGER, allowNull: true },
      mobile: { type: DataTypes.STRING(13), allowNull: true },
      is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    {
      sequelize, modelName: 'FieldAgentProfile', tableName: 'field_agent_profiles',
      timestamps: true, underscored: true,
    }
  );

  return FieldAgentProfile;
};
