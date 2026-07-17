/**
 * OnboardingProgress Model
 * Tracks each onboarding step's completion and stores a data snapshot.
 */

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class OnboardingProgress extends Model {
    static associate(models) {
      OnboardingProgress.belongsTo(models.User, { foreignKey: 'farmer_id', as: 'farmer' });
    }
  }

  OnboardingProgress.init(
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      farmer_id: {
        type: DataTypes.INTEGER, allowNull: false,
        references: { model: 'users', key: 'id' },
      },
      step_name: { type: DataTypes.STRING(50), allowNull: false },
      step_number: { type: DataTypes.INTEGER, allowNull: false },
      is_completed: { type: DataTypes.BOOLEAN, defaultValue: false },
      completed_at: { type: DataTypes.DATE, allowNull: true },
      data_snapshot: { type: DataTypes.JSON, allowNull: true, comment: 'Submitted data for this step' },
      is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    {
      sequelize, modelName: 'OnboardingProgress', tableName: 'onboarding_progress',
      timestamps: true, underscored: true,
      indexes: [
        { unique: true, fields: ['farmer_id', 'step_number'], name: 'idx_farmer_step_unique' },
      ],
    }
  );

  return OnboardingProgress;
};
