/**
 * FarmerSchemeEnrollment Model
 * Government scheme enrollment: PM-KISAN, PMFBY, PMMSY, MIDH, etc.
 */

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class FarmerSchemeEnrollment extends Model {
    static associate(models) {
      FarmerSchemeEnrollment.belongsTo(models.User, { foreignKey: 'farmer_id', as: 'farmer' });
    }
  }

  FarmerSchemeEnrollment.init(
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      enrollment_uuid: { type: DataTypes.STRING(36), allowNull: false, unique: true },
      farmer_id: {
        type: DataTypes.INTEGER, allowNull: false,
        references: { model: 'users', key: 'id' },
      },
      scheme_code: { type: DataTypes.STRING(20), allowNull: false },
      scheme_name: { type: DataTypes.STRING(100), allowNull: false },
      scheme_category: {
        type: DataTypes.ENUM('pm_kisan', 'pmfby', 'pmmsy', 'midh', 'smam', 'aif', 'nrlm', 'dbt_other'),
        allowNull: false,
      },
      enrollment_status: {
        type: DataTypes.ENUM('active', 'expired', 'pending', 'rejected'), defaultValue: 'active',
      },
      benefit_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      last_benefit_date: { type: DataTypes.DATEONLY, allowNull: true },
      benefit_frequency: {
        type: DataTypes.ENUM('annual', 'seasonal', 'one_time', 'monthly'), allowNull: true,
      },
      verification_source: { type: DataTypes.STRING(50), allowNull: true },
      is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    {
      sequelize, modelName: 'FarmerSchemeEnrollment', tableName: 'farmer_scheme_enrollments',
      timestamps: true, underscored: true,
      indexes: [
        { fields: ['enrollment_uuid'], unique: true },
        { fields: ['farmer_id'] },
        { fields: ['scheme_code'] },
        { fields: ['enrollment_status'] },
      ],
    }
  );

  return FarmerSchemeEnrollment;
};
