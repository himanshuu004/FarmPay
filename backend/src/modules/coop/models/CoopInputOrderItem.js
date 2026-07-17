/**
 * CoopInputOrderItem — a single line on a CoopInputOrder. Line snapshots
 * (sku/name/price) are frozen at order time so later catalog edits don't
 * mutate historical orders.
 */
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class CoopInputOrderItem extends Model {
    static associate(models) {
      if (models.CoopInputOrder) {
        CoopInputOrderItem.belongsTo(models.CoopInputOrder, { foreignKey: 'order_id', as: 'order' });
      }
      if (models.CoopInputItem) {
        CoopInputOrderItem.belongsTo(models.CoopInputItem, { foreignKey: 'item_id', as: 'item' });
      }
    }
  }
  CoopInputOrderItem.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    order_id: { type: DataTypes.INTEGER, allowNull: false },
    item_id: { type: DataTypes.INTEGER, allowNull: true },
    sku: { type: DataTypes.STRING(40), allowNull: false },
    name: { type: DataTypes.STRING(120), allowNull: false },
    quantity: { type: DataTypes.INTEGER, allowNull: false },
    unit_price: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    line_total: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  }, {
    sequelize, modelName: 'CoopInputOrderItem', tableName: 'coop_input_order_items',
    timestamps: true, underscored: true,
  });
  return CoopInputOrderItem;
};
