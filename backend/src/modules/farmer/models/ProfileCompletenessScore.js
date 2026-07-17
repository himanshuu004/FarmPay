/**
 * ProfileCompletenessScore Model
 * Category-level profile completeness tracking (personal, contact, location, bank, etc.).
 */

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ProfileCompletenessScore extends Model {
    static associate(models) {
      ProfileCompletenessScore.belongsTo(models.User, { foreignKey: 'farmer_id', as: 'farmer' });
    }
  }

  ProfileCompletenessScore.init(
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      farmer_id: {
        type: DataTypes.INTEGER, allowNull: false,
        references: { model: 'users', key: 'id' },
      },
      category: { type: DataTypes.STRING(50), allowNull: false },
      score_percentage: { type: DataTypes.INTEGER, defaultValue: 0 },
      last_updated: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
      is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    {
      sequelize, modelName: 'ProfileCompletenessScore', tableName: 'profile_completeness_scores',
      timestamps: true, underscored: true,
      indexes: [
        { unique: true, fields: ['farmer_id', 'category'], name: 'idx_farmer_category_unique' },
      ],
    }
  );

  return ProfileCompletenessScore;
};
