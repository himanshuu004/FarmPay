/**
 * FarmerNameRecord Model
 * Standardized English + vernacular name with phonetic keys for dedup.
 */

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class FarmerNameRecord extends Model {
    static associate(models) {
      FarmerNameRecord.belongsTo(models.User, { foreignKey: 'farmer_id', as: 'user' });
    }
  }

  FarmerNameRecord.init(
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      farmer_id: {
        type: DataTypes.INTEGER, allowNull: false,
        references: { model: 'users', key: 'id' },
      },
      name_uuid: { type: DataTypes.STRING(36), allowNull: false, unique: true },
      full_name_en: {
        type: DataTypes.STRING(150), allowNull: true,
        comment: 'Standardized uppercase transliterated English name',
      },
      first_name_en: { type: DataTypes.STRING(60), allowNull: false },
      middle_name_en: { type: DataTypes.STRING(60), allowNull: true },
      last_name_en: { type: DataTypes.STRING(60), allowNull: true },
      full_name_vernacular: {
        type: DataTypes.STRING(200), allowNull: true,
        comment: 'Original script name (Devanagari, Telugu, etc.)',
      },
      vernacular_language_code: {
        type: DataTypes.STRING(5), allowNull: true,
        comment: 'ISO 639-1 code (hi, te, kn, etc.)',
      },
      phonetic_key_soundex: {
        type: DataTypes.STRING(20), allowNull: true,
        comment: 'Soundex of full_name_en for fuzzy dedup',
      },
      phonetic_key_metaphone: {
        type: DataTypes.STRING(30), allowNull: true,
        comment: 'Double Metaphone for better Indian name matching',
      },
      name_source: {
        type: DataTypes.ENUM('self_declared', 'aadhaar_ekyc', 'agent_verified', 'bank_cbs', 'agristack'),
        defaultValue: 'self_declared',
      },
      name_match_confidence: {
        type: DataTypes.DECIMAL(5, 2), allowNull: true,
        comment: '0-100 confidence that self-declared matches DPI source',
      },
      standardized_at: { type: DataTypes.DATE, allowNull: true },
      is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    {
      sequelize, modelName: 'FarmerNameRecord', tableName: 'farmer_name_records',
      timestamps: true, underscored: true,
      indexes: [
        { unique: true, fields: ['farmer_id'], name: 'idx_farmer_name_farmer_id', where: { is_active: true } },
        { fields: ['phonetic_key_soundex'], name: 'idx_farmer_name_soundex' },
        { fields: ['phonetic_key_metaphone'], name: 'idx_farmer_name_metaphone' },
        { fields: ['full_name_en'], name: 'idx_farmer_name_en' },
      ],
    }
  );

  return FarmerNameRecord;
};
