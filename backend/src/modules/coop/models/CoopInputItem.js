/**
 * CoopInputItem — catalog of distributable inputs (feed, mineral mix, medicine,
 * fodder seed, equipment). Feeds the feed-price board (§9) and order lines.
 * Sourced from the co-op catalog (ERP / filedrop).
 */
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class CoopInputItem extends Model {
    static associate() {}
  }
  CoopInputItem.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    item_uuid: { type: DataTypes.UUID, allowNull: false, unique: true },
    sku: { type: DataTypes.STRING(40), allowNull: false, unique: true },
    name: { type: DataTypes.STRING(120), allowNull: false },
    category: { type: DataTypes.STRING(40), allowNull: false }, // FEED|MINERAL|MEDICINE|FODDER_SEED|EQUIPMENT
    unit: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'bag' },
    mrp: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    subsidised_price: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    source_mode: { type: DataTypes.STRING(12), allowNull: false, defaultValue: 'mock' },
    synced_at: { type: DataTypes.DATE, allowNull: true },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    sequelize, modelName: 'CoopInputItem', tableName: 'coop_input_items',
    timestamps: true, underscored: true,
  });
  return CoopInputItem;
};
