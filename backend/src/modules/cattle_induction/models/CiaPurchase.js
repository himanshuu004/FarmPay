/**
 * CiaPurchase — ties an application to its animal, seller and transport, and
 * carries the guided-purchase status. It is the node where the payment GATE is
 * enforced (Convention 31): SELLER_PAYMENT_PENDING is unreachable until vet cert
 * + transit & cattle insurance + farmer acknowledgment exist AND the traceability
 * chain is complete. Seller payout / EMI land in CIA-2/CIA-3.
 */
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class CiaPurchase extends Model {
    static associate(models) {
      if (models.CiaApplication) CiaPurchase.belongsTo(models.CiaApplication, { foreignKey: 'application_id', as: 'application' });
      if (models.CiaAnimal) CiaPurchase.belongsTo(models.CiaAnimal, { foreignKey: 'animal_id', as: 'animal' });
      if (models.CiaSeller) CiaPurchase.belongsTo(models.CiaSeller, { foreignKey: 'seller_id', as: 'seller' });
      if (models.CiaTransport) CiaPurchase.hasOne(models.CiaTransport, { foreignKey: 'purchase_id', as: 'transport' });
    }
  }
  CiaPurchase.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    purchase_uuid: { type: DataTypes.UUID, allowNull: false, unique: true },
    application_id: { type: DataTypes.INTEGER, allowNull: false, unique: true },
    animal_id: { type: DataTypes.INTEGER, allowNull: true },
    seller_id: { type: DataTypes.INTEGER, allowNull: true },
    status: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'PURCHASE_INITIATED' },
    // Gate inputs (set as each verification completes).
    vet_certified: { type: DataTypes.BOOLEAN, defaultValue: false },       // CIA-3
    transit_insured: { type: DataTypes.BOOLEAN, defaultValue: false },
    cattle_insured: { type: DataTypes.BOOLEAN, defaultValue: false },
    cattle_policy_no: { type: DataTypes.STRING(60), allowNull: true },
    farmer_acknowledged: { type: DataTypes.BOOLEAN, defaultValue: false }, // ★
    purchase_lat: { type: DataTypes.DECIMAL(9, 6), allowNull: true },
    purchase_lng: { type: DataTypes.DECIMAL(9, 6), allowNull: true },
    within_geofence: { type: DataTypes.BOOLEAN, allowNull: true },         // CIA-3
    exception_flags: { type: DataTypes.JSONB, allowNull: true },           // fraud/gate flags → human review
    initiated_at: { type: DataTypes.DATE, allowNull: true },
    delivered_at: { type: DataTypes.DATE, allowNull: true },
  }, {
    sequelize, modelName: 'CiaPurchase', tableName: 'cia_purchases',
    timestamps: true, underscored: true,
    indexes: [{ fields: ['application_id'] }, { fields: ['status'] }],
  });
  return CiaPurchase;
};
