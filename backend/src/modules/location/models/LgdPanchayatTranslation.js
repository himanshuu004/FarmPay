/**
 * LgdPanchayatTranslation Model
 * Multi-language translations for gram panchayat names.
 */

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class LgdPanchayatTranslation extends Model {
    static associate(models) {
      LgdPanchayatTranslation.belongsTo(models.LgdPanchayat, { foreignKey: 'lgd_panchayat_id', as: 'panchayat' });
    }
  }

  LgdPanchayatTranslation.init(
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      lgd_panchayat_id: {
        type: DataTypes.INTEGER, allowNull: false,
        references: { model: 'lgd_panchayats', key: 'id' },
      },
      language_code: { type: DataTypes.STRING(5), allowNull: false },
      translated_name: { type: DataTypes.STRING(100), allowNull: false },
      is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    {
      sequelize, modelName: 'LgdPanchayatTranslation', tableName: 'lgd_panchayat_translations',
      timestamps: true, underscored: true,
      indexes: [
        { unique: true, fields: ['lgd_panchayat_id', 'language_code'], name: 'idx_panchayat_trans_unique' },
      ],
    }
  );

  return LgdPanchayatTranslation;
};
