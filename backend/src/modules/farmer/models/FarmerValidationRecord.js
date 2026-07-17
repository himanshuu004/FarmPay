/**
 * FarmerValidationRecord Model
 * Tracks 5-level validation per data target:
 *   L1: Self-declared, L2: App-validated, L3: Geo-tagged,
 *   L4: Field officer verified, L5: DPI-confirmed.
 */

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class FarmerValidationRecord extends Model {
    static associate(models) {
      FarmerValidationRecord.belongsTo(models.User, { foreignKey: 'farmer_id', as: 'farmer' });
      FarmerValidationRecord.belongsTo(models.User, { foreignKey: 'level_4_officer_id', as: 'fieldOfficer' });
    }
  }

  FarmerValidationRecord.init(
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      validation_uuid: { type: DataTypes.STRING(36), allowNull: false, unique: true },
      farmer_id: {
        type: DataTypes.INTEGER, allowNull: false,
        references: { model: 'users', key: 'id' },
      },
      validation_target: {
        type: DataTypes.ENUM(
          'name', 'aadhaar', 'address_permanent', 'address_current', 'address_farm',
          'mobile', 'bank_account', 'land_ownership', 'farm_gps'
        ),
        allowNull: false,
      },
      // Level 1: Self-declared
      level_1_self_declared: { type: DataTypes.BOOLEAN, defaultValue: false },
      level_1_at: { type: DataTypes.DATE, allowNull: true },
      // Level 2: App-validated (format checks, regex, IFSC lookup, LGD validation)
      level_2_app_validated: { type: DataTypes.BOOLEAN, defaultValue: false },
      level_2_at: { type: DataTypes.DATE, allowNull: true },
      level_2_method: {
        type: DataTypes.STRING(50), allowNull: true,
        comment: 'regex, otp, penny_drop, ifsc_lookup, lgd_validated, ocr',
      },
      // Level 3: Geo-tagged (GPS within village boundary)
      level_3_geo_tagged: { type: DataTypes.BOOLEAN, defaultValue: false },
      level_3_at: { type: DataTypes.DATE, allowNull: true },
      level_3_lat: { type: DataTypes.DECIMAL(10, 8), allowNull: true },
      level_3_lng: { type: DataTypes.DECIMAL(11, 8), allowNull: true },
      level_3_accuracy_m: { type: DataTypes.INTEGER, allowNull: true },
      // Level 4: Field officer (SATHI physical verification)
      level_4_field_officer: { type: DataTypes.BOOLEAN, defaultValue: false },
      level_4_at: { type: DataTypes.DATE, allowNull: true },
      level_4_officer_id: {
        type: DataTypes.INTEGER, allowNull: true,
        references: { model: 'users', key: 'id' },
      },
      level_4_photo_url: { type: DataTypes.STRING(500), allowNull: true },
      level_4_notes: { type: DataTypes.TEXT, allowNull: true },
      // Level 5: DPI-confirmed (AgriStack, UIDAI, bank CBS match)
      level_5_dpi_confirmed: { type: DataTypes.BOOLEAN, defaultValue: false },
      level_5_at: { type: DataTypes.DATE, allowNull: true },
      level_5_source: {
        type: DataTypes.ENUM('agristack', 'uidai', 'bank_cbs', 'uli', 'none'),
        allowNull: true,
      },
      level_5_reference_id: { type: DataTypes.STRING(100), allowNull: true },
      // Computed fields
      composite_validation_level: {
        type: DataTypes.INTEGER, defaultValue: 0,
        comment: 'Highest completed level (1-5)',
      },
      composite_confidence: {
        type: DataTypes.DECIMAL(5, 2), defaultValue: 0,
        comment: 'Weighted score 0-100',
      },
      is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    {
      sequelize, modelName: 'FarmerValidationRecord', tableName: 'farmer_validation_records',
      timestamps: true, underscored: true,
      indexes: [
        { unique: true, fields: ['farmer_id', 'validation_target'], name: 'idx_farmer_validation_unique', where: { is_active: true } },
        { fields: ['composite_validation_level'], name: 'idx_validation_level' },
        { fields: ['farmer_id'], name: 'idx_validation_farmer' },
      ],
    }
  );

  return FarmerValidationRecord;
};
