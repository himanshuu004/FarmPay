/**
 * FarmerDairyProfile Model
 * Per-farmer dairy operation profile. Stores herd-tier (drives mobile UX),
 * cooperative linkage, default payment mode, and entry-mode preference.
 */

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class FarmerDairyProfile extends Model {
    static associate(models) {
      FarmerDairyProfile.belongsTo(models.User, { foreignKey: 'farmer_id', as: 'farmer' });
    }
  }

  FarmerDairyProfile.init(
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      profile_uuid: { type: DataTypes.STRING(36), allowNull: false, unique: true },
      farmer_id: { type: DataTypes.INTEGER, allowNull: false, unique: true },
      herd_tier: {
        type: DataTypes.ENUM('SMALL', 'MEDIUM', 'LARGE'),
        allowNull: false,
        defaultValue: 'SMALL',
      },
      entry_mode: {
        type: DataTypes.ENUM('TRANSACTIONAL', 'WEEKLY_BULK', 'MONTHLY_BULK'),
        allowNull: false,
        defaultValue: 'TRANSACTIONAL',
      },
      cooperative_name: { type: DataTypes.STRING(120), allowNull: true },
      cooperative_member_id: { type: DataTypes.STRING(50), allowNull: true },
      default_payment_mode: {
        type: DataTypes.ENUM('CASH', 'UPI', 'BANK', 'CREDIT', 'NONE'),
        allowNull: false,
        defaultValue: 'CASH',
      },
      currency: { type: DataTypes.STRING(8), allowNull: false, defaultValue: 'INR' },
      onboarded_at: { type: DataTypes.DATE, allowNull: true },
      last_active_at: { type: DataTypes.DATE, allowNull: true },
      is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    {
      sequelize,
      modelName: 'FarmerDairyProfile',
      tableName: 'farmer_dairy_profiles',
      timestamps: true,
      underscored: true,
    },
  );

  return FarmerDairyProfile;
};
