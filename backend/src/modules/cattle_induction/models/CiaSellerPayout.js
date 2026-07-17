/**
 * CiaSellerPayout — the seller-payment RECOMMENDATION and (once executed) the
 * payout record (CIA-3). The CIA payment gate (Convention 31) only ever
 * RECOMMENDS; execution is a separate, human-authorised confirm that calls the
 * payment rail. Payee must equal the penny-drop-verified registered seller.
 */
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class CiaSellerPayout extends Model {
    static associate(models) {
      if (models.CiaApplication) CiaSellerPayout.belongsTo(models.CiaApplication, { foreignKey: 'application_id', as: 'application' });
      if (models.CiaPurchase) CiaSellerPayout.belongsTo(models.CiaPurchase, { foreignKey: 'purchase_id', as: 'purchase' });
    }
  }
  CiaSellerPayout.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    payout_uuid: { type: DataTypes.UUID, allowNull: false, unique: true },
    application_id: { type: DataTypes.INTEGER, allowNull: false },
    purchase_id: { type: DataTypes.INTEGER, allowNull: false, unique: true },
    seller_id: { type: DataTypes.INTEGER, allowNull: false },
    payee_account: { type: DataTypes.STRING(34), allowNull: false },
    amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    status: { type: DataTypes.STRING(12), allowNull: false, defaultValue: 'RECOMMENDED' }, // RECOMMENDED|PAID
    penny_drop_ref: { type: DataTypes.STRING(60), allowNull: true },
    payout_ref: { type: DataTypes.STRING(60), allowNull: true },
    recommended_by_user_id: { type: DataTypes.INTEGER, allowNull: false },
    recommended_at: { type: DataTypes.DATE, allowNull: false },
    confirmed_by_user_id: { type: DataTypes.INTEGER, allowNull: true },
    paid_at: { type: DataTypes.DATE, allowNull: true },
  }, {
    sequelize, modelName: 'CiaSellerPayout', tableName: 'cia_seller_payouts',
    timestamps: true, underscored: true,
    indexes: [{ fields: ['application_id'] }, { fields: ['purchase_id'], unique: true }],
  });
  return CiaSellerPayout;
};
