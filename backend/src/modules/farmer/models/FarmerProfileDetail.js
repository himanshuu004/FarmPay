/**
 * FarmerProfileDetail Model
 * Extended farmer details: family, income, farm infrastructure.
 */

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class FarmerProfileDetail extends Model {
    static associate(models) {
      FarmerProfileDetail.belongsTo(models.FarmerProfile, { foreignKey: 'farmer_profile_id', as: 'profile' });
    }
  }

  FarmerProfileDetail.init(
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      farmer_profile_id: {
        type: DataTypes.INTEGER, allowNull: false,
        references: { model: 'farmer_profiles', key: 'id' },
      },
      family_members: { type: DataTypes.INTEGER, allowNull: true },
      children_count: { type: DataTypes.INTEGER, allowNull: true },
      dependents_count: { type: DataTypes.INTEGER, allowNull: true },
      primary_income_source: {
        type: DataTypes.ENUM('farming', 'labor', 'business', 'salary', 'other'),
        allowNull: true,
      },
      secondary_income_source_active: { type: DataTypes.BOOLEAN, defaultValue: false },
      secondary_income_source: { type: DataTypes.STRING(50), allowNull: true },
      avg_annual_income: { type: DataTypes.DECIMAL(15, 2), allowNull: true },
      has_irrigation: { type: DataTypes.BOOLEAN, defaultValue: false },
      irrigation_type: { type: DataTypes.STRING(50), allowNull: true },
      has_pesticides: { type: DataTypes.BOOLEAN, defaultValue: false },
      has_seeds: { type: DataTypes.BOOLEAN, defaultValue: false },
      is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    {
      sequelize, modelName: 'FarmerProfileDetail', tableName: 'farmer_profile_details',
      timestamps: true, underscored: true,
    }
  );

  return FarmerProfileDetail;
};
