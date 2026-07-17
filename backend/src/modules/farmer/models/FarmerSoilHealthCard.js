/**
 * FarmerSoilHealthCard Model
 * Per-farmer Soil Health Card captured during onboarding (FarmerPay-owned).
 * One active row per farmer; reused as anchor for SAGE hyperlocal advisories.
 */

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class FarmerSoilHealthCard extends Model {
    static associate(models) {
      FarmerSoilHealthCard.belongsTo(models.User, { foreignKey: 'farmer_id', as: 'farmer' });
    }
  }

  FarmerSoilHealthCard.init(
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      farmer_id: {
        type: DataTypes.INTEGER, allowNull: false, unique: true,
        references: { model: 'users', key: 'id' },
      },
      photo_url: { type: DataTypes.STRING(512), allowNull: true },
      photo_captured_at: { type: DataTypes.DATE, allowNull: true },
      latitude: { type: DataTypes.DECIMAL(10, 7), allowNull: true },
      longitude: { type: DataTypes.DECIMAL(10, 7), allowNull: true },
      location_accuracy_m: { type: DataTypes.DECIMAL(8, 2), allowNull: true },
      soil_type: {
        type: DataTypes.ENUM(
          'alluvial', 'black', 'red', 'laterite',
          'arid', 'mountain', 'saline', 'peaty', 'other'
        ),
        allowNull: true,
      },
      ph: { type: DataTypes.DECIMAL(4, 2), allowNull: true },
      ec: { type: DataTypes.DECIMAL(6, 3), allowNull: true },
      organic_carbon: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
      nitrogen_n: { type: DataTypes.DECIMAL(8, 2), allowNull: true },
      phosphorus_p: { type: DataTypes.DECIMAL(8, 2), allowNull: true },
      potassium_k: { type: DataTypes.DECIMAL(8, 2), allowNull: true },
      sulphur_s: { type: DataTypes.DECIMAL(8, 2), allowNull: true },
      zinc_zn: { type: DataTypes.DECIMAL(6, 3), allowNull: true },
      boron_b: { type: DataTypes.DECIMAL(6, 3), allowNull: true },
      iron_fe: { type: DataTypes.DECIMAL(6, 3), allowNull: true },
      manganese_mn: { type: DataTypes.DECIMAL(6, 3), allowNull: true },
      copper_cu: { type: DataTypes.DECIMAL(6, 3), allowNull: true },
      source: {
        type: DataTypes.ENUM('photo_only', 'manual_entry', 'photo_plus_manual'),
        allowNull: false, defaultValue: 'manual_entry',
      },
      card_issue_date: { type: DataTypes.DATEONLY, allowNull: true },
      card_reference_no: { type: DataTypes.STRING(64), allowNull: true },
      raw_ocr_text: { type: DataTypes.TEXT, allowNull: true },
    },
    {
      sequelize,
      modelName: 'FarmerSoilHealthCard',
      tableName: 'farmer_soil_health_cards',
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ['farmer_id'] },
        { fields: ['latitude', 'longitude'] },
      ],
    }
  );

  return FarmerSoilHealthCard;
};
