/**
 * PacsRegistry Model
 * Master list of Primary Agricultural Credit Societies (PACS).
 */

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class PacsRegistry extends Model {
    static associate(models) {
      PacsRegistry.belongsTo(models.LgdBlock, { foreignKey: 'lgd_block_id', as: 'block' });
      PacsRegistry.belongsTo(models.LgdDistrict, { foreignKey: 'lgd_district_id', as: 'district' });
    }
  }

  PacsRegistry.init(
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      pacs_code: { type: DataTypes.STRING(30), allowNull: false, unique: true },
      pacs_name: { type: DataTypes.STRING(150), allowNull: false },
      lgd_block_id: {
        type: DataTypes.INTEGER, allowNull: true,
        references: { model: 'lgd_blocks', key: 'id' },
      },
      lgd_district_id: {
        type: DataTypes.INTEGER, allowNull: true,
        references: { model: 'lgd_districts', key: 'id' },
      },
      affiliated_bank_name: { type: DataTypes.STRING(100), allowNull: true },
      affiliated_bank_ifsc: { type: DataTypes.STRING(11), allowNull: true },
      cbs_enabled: { type: DataTypes.BOOLEAN, defaultValue: false },
      total_members: { type: DataTypes.INTEGER, allowNull: true },
      latitude: { type: DataTypes.DECIMAL(10, 8), allowNull: true },
      longitude: { type: DataTypes.DECIMAL(11, 8), allowNull: true },
      is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    {
      sequelize, modelName: 'PacsRegistry', tableName: 'pacs_registry',
      timestamps: true, underscored: true,
      indexes: [
        { unique: true, fields: ['pacs_code'], name: 'idx_pacs_code' },
        { fields: ['lgd_block_id'], name: 'idx_pacs_block' },
        { fields: ['lgd_district_id'], name: 'idx_pacs_district' },
      ],
    }
  );

  return PacsRegistry;
};
