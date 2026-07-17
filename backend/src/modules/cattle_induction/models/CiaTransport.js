/**
 * CiaTransport — transit leg of a purchase: vehicle, driver, bill/challan, and
 * origin/destination geo. Transit insurance must exist before movement; a
 * substitution check compares inspection tag/photo vs arrival tag/photo (CIA-3).
 */
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class CiaTransport extends Model {
    static associate(models) {
      if (models.CiaPurchase) CiaTransport.belongsTo(models.CiaPurchase, { foreignKey: 'purchase_id', as: 'purchase' });
    }
  }
  CiaTransport.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    purchase_id: { type: DataTypes.INTEGER, allowNull: false },
    vehicle_reg_no: { type: DataTypes.STRING(16), allowNull: false },
    driver_name: { type: DataTypes.STRING(120), allowNull: false },
    driver_id_ref: { type: DataTypes.STRING(200), allowNull: true },
    bill_ref: { type: DataTypes.STRING(200), allowNull: true },
    challan_ref: { type: DataTypes.STRING(200), allowNull: true },
    origin_lat: { type: DataTypes.DECIMAL(9, 6), allowNull: true },
    origin_lng: { type: DataTypes.DECIMAL(9, 6), allowNull: true },
    destination_lat: { type: DataTypes.DECIMAL(9, 6), allowNull: true },
    destination_lng: { type: DataTypes.DECIMAL(9, 6), allowNull: true },
    transit_policy_no: { type: DataTypes.STRING(60), allowNull: true }, // KAVACH transit cover
    transit_started_at: { type: DataTypes.DATE, allowNull: true },
    delivered_at: { type: DataTypes.DATE, allowNull: true },
  }, {
    sequelize, modelName: 'CiaTransport', tableName: 'cia_transport',
    timestamps: true, underscored: true,
  });
  return CiaTransport;
};
