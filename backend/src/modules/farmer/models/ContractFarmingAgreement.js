/**
 * ContractFarmingAgreement Model
 * Contract farming agreements: buyer, crop, price, delivery terms.
 */

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ContractFarmingAgreement extends Model {
    static associate(models) {
      ContractFarmingAgreement.belongsTo(models.User, { foreignKey: 'farmer_id', as: 'farmer' });
    }
  }

  ContractFarmingAgreement.init(
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      agreement_uuid: { type: DataTypes.STRING(36), allowNull: false, unique: true },
      farmer_id: {
        type: DataTypes.INTEGER, allowNull: false,
        references: { model: 'users', key: 'id' },
      },
      buyer_company_name: { type: DataTypes.STRING(100), allowNull: false },
      buyer_contact: { type: DataTypes.STRING(100), allowNull: true },
      crop: { type: DataTypes.STRING(50), allowNull: false },
      variety: { type: DataTypes.STRING(50), allowNull: true },
      agreed_price_per_unit: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      quantity_commitment: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      unit: { type: DataTypes.STRING(20), allowNull: true },
      delivery_start_date: { type: DataTypes.DATEONLY, allowNull: true },
      delivery_end_date: { type: DataTypes.DATEONLY, allowNull: true },
      penalty_clause_summary: { type: DataTypes.TEXT, allowNull: true },
      payment_terms: { type: DataTypes.STRING(200), allowNull: true },
      agreement_status: {
        type: DataTypes.ENUM('active', 'completed', 'terminated', 'expired'), defaultValue: 'active',
      },
      document_url: { type: DataTypes.STRING(500), allowNull: true },
      season: { type: DataTypes.STRING(20), allowNull: true },
      is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    {
      sequelize, modelName: 'ContractFarmingAgreement', tableName: 'contract_farming_agreements',
      timestamps: true, underscored: true,
      indexes: [
        { fields: ['agreement_uuid'], unique: true },
        { fields: ['farmer_id'] },
        { fields: ['agreement_status'] },
        { fields: ['season'] },
      ],
    }
  );

  return ContractFarmingAgreement;
};
