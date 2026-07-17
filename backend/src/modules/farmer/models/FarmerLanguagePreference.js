/**
 * FarmerLanguagePreference Model
 * Tracks which languages a farmer speaks and their proficiency/preference order.
 */

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class FarmerLanguagePreference extends Model {
    static associate(models) {
      FarmerLanguagePreference.belongsTo(models.User, { foreignKey: 'farmer_id', as: 'user' });
    }
  }

  FarmerLanguagePreference.init(
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      farmer_id: {
        type: DataTypes.INTEGER, allowNull: false,
        references: { model: 'users', key: 'id' },
      },
      language_code: { type: DataTypes.STRING(10), allowNull: false },
      proficiency: {
        type: DataTypes.ENUM('basic', 'intermediate', 'fluent', 'native'),
        defaultValue: 'fluent',
      },
      preferred_order: { type: DataTypes.INTEGER, defaultValue: 0 },
      is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    {
      sequelize, modelName: 'FarmerLanguagePreference', tableName: 'farmer_language_preferences',
      timestamps: true, underscored: true,
      indexes: [
        { unique: true, fields: ['farmer_id', 'language_code'], name: 'idx_farmer_lang_unique' },
      ],
    }
  );

  return FarmerLanguagePreference;
};
