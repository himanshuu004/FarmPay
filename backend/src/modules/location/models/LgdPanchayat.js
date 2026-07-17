/**
 * LgdPanchayat Model
 * Gram Panchayat level in LGD hierarchy: State → District → Block → Panchayat → Village
 */

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class LgdPanchayat extends Model {
    static associate(models) {
      LgdPanchayat.belongsTo(models.LgdBlock, { foreignKey: 'block_id', as: 'block' });
      LgdPanchayat.hasMany(models.LgdPanchayatTranslation, { foreignKey: 'lgd_panchayat_id', as: 'translations' });
      LgdPanchayat.belongsToMany(models.LgdVillage, {
        through: models.LgdVillagePanchayatMap,
        foreignKey: 'lgd_panchayat_id',
        otherKey: 'lgd_village_id',
        as: 'villages',
      });
    }
  }

  LgdPanchayat.init(
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      panchayat_code: { type: DataTypes.STRING(15), allowNull: false, unique: true },
      block_id: {
        type: DataTypes.INTEGER, allowNull: false,
        references: { model: 'lgd_blocks', key: 'id' },
      },
      panchayat_name: { type: DataTypes.STRING(100), allowNull: false },
      panchayat_name_en: { type: DataTypes.STRING(100), allowNull: true },
      panchayat_type: {
        type: DataTypes.ENUM('gram_panchayat', 'town_panchayat', 'nagar_panchayat'),
        defaultValue: 'gram_panchayat',
      },
      total_villages: { type: DataTypes.INTEGER, allowNull: true },
      latitude: { type: DataTypes.DECIMAL(10, 8), allowNull: true },
      longitude: { type: DataTypes.DECIMAL(11, 8), allowNull: true },
      is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    {
      sequelize, modelName: 'LgdPanchayat', tableName: 'lgd_panchayats',
      timestamps: true, underscored: true,
      indexes: [
        { unique: true, fields: ['panchayat_code'], name: 'idx_panchayat_code' },
        { fields: ['block_id'], name: 'idx_panchayat_block' },
      ],
    }
  );

  return LgdPanchayat;
};
