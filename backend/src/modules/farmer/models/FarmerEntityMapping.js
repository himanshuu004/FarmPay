/**
 * FarmerEntityMapping Model
 * Single mapping hub linking each farmer to all institutional entity codes:
 * bank branch, PACS, FPO, vendor cluster, agro-climatic zone, mandi, etc.
 */

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class FarmerEntityMapping extends Model {
    static associate(models) {
      FarmerEntityMapping.belongsTo(models.User, { foreignKey: 'farmer_id', as: 'farmer' });
      FarmerEntityMapping.belongsTo(models.User, { foreignKey: 'verified_by', as: 'verifier' });
    }
  }

  FarmerEntityMapping.init(
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      mapping_uuid: { type: DataTypes.STRING(36), allowNull: false, unique: true },
      farmer_id: {
        type: DataTypes.INTEGER, allowNull: false,
        references: { model: 'users', key: 'id' },
      },
      entity_type: {
        type: DataTypes.ENUM(
          'bank_branch', 'pacs', 'fpo', 'vendor_cluster',
          'agro_climatic_zone', 'sati_zone', 'mandi',
          'insurance_unit', 'krishi_vigyan_kendra'
        ),
        allowNull: false,
      },
      entity_code: {
        type: DataTypes.STRING(50), allowNull: false,
        comment: 'IFSC, PACS reg no, FPO ID, zone code, mandi code, etc.',
      },
      entity_name: { type: DataTypes.STRING(150), allowNull: true },
      entity_metadata: {
        type: DataTypes.JSON, allowNull: true,
        comment: 'Flexible store for entity-specific attributes',
      },
      source: {
        type: DataTypes.ENUM('self_declared', 'geo_inferred', 'agent_assigned', 'bank_linked', 'agristack', 'system'),
        allowNull: false,
      },
      confidence_score: {
        type: DataTypes.DECIMAL(5, 2), allowNull: true,
        comment: '0-100 confidence in this mapping',
      },
      linked_at: { type: DataTypes.DATE, allowNull: false },
      verified_at: { type: DataTypes.DATE, allowNull: true },
      verified_by: {
        type: DataTypes.INTEGER, allowNull: true,
        references: { model: 'users', key: 'id' },
      },
      is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    {
      sequelize, modelName: 'FarmerEntityMapping', tableName: 'farmer_entity_mappings',
      timestamps: true, underscored: true,
      indexes: [
        { unique: true, fields: ['farmer_id', 'entity_type', 'entity_code'], name: 'idx_farmer_entity_unique', where: { is_active: true } },
        { fields: ['entity_type', 'entity_code'], name: 'idx_entity_type_code' },
        { fields: ['farmer_id', 'entity_type'], name: 'idx_farmer_entity_type' },
      ],
    }
  );

  return FarmerEntityMapping;
};
