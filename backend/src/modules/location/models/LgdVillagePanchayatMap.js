/**
 * LgdVillagePanchayatMap Model
 * Maps villages to panchayats (many villages can belong to one panchayat).
 */

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class LgdVillagePanchayatMap extends Model {
    static associate(models) {
      LgdVillagePanchayatMap.belongsTo(models.LgdVillage, { foreignKey: 'lgd_village_id', as: 'village' });
      LgdVillagePanchayatMap.belongsTo(models.LgdPanchayat, { foreignKey: 'lgd_panchayat_id', as: 'panchayat' });
    }
  }

  LgdVillagePanchayatMap.init(
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      lgd_village_id: {
        type: DataTypes.INTEGER, allowNull: false,
        references: { model: 'lgd_villages', key: 'id' },
      },
      lgd_panchayat_id: {
        type: DataTypes.INTEGER, allowNull: false,
        references: { model: 'lgd_panchayats', key: 'id' },
      },
      is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    {
      sequelize, modelName: 'LgdVillagePanchayatMap', tableName: 'lgd_village_panchayat_map',
      timestamps: true, underscored: true,
      indexes: [
        { unique: true, fields: ['lgd_village_id', 'lgd_panchayat_id'], name: 'idx_village_panchayat_unique' },
      ],
    }
  );

  return LgdVillagePanchayatMap;
};
