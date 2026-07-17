/**
 * FarmerProfile Model
 * Core farmer identity: personal info, KYC status, farm details, onboarding progress.
 * Aadhaar is encrypted at Level 4 (KMS) and audit-logged.
 */

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class FarmerProfile extends Model {
    static associate(models) {
      FarmerProfile.belongsTo(models.User, { foreignKey: 'farmer_id', as: 'user' });
      FarmerProfile.hasOne(models.FarmerProfileDetail, { foreignKey: 'farmer_profile_id', as: 'details' });
      FarmerProfile.hasMany(models.FarmerAddress, { foreignKey: 'farmer_id', sourceKey: 'farmer_id', as: 'addresses' });
      FarmerProfile.hasMany(models.FarmerBankAccount, { foreignKey: 'farmer_id', sourceKey: 'farmer_id', as: 'bankAccounts' });
      FarmerProfile.hasOne(models.FarmerActivityPreference, { foreignKey: 'farmer_id', sourceKey: 'farmer_id', as: 'activityPreferences' });
    }
  }

  FarmerProfile.init(
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      farmer_id: {
        type: DataTypes.INTEGER, allowNull: false, unique: true,
        references: { model: 'users', key: 'id' },
      },
      profile_uuid: { type: DataTypes.STRING(36), allowNull: false, unique: true },
      full_name: { type: DataTypes.STRING(120), allowNull: true },
      alternate_phone: { type: DataTypes.STRING(13), allowNull: true },
      contact_stale: { type: DataTypes.BOOLEAN, defaultValue: false },
      contact_last_verified_at: { type: DataTypes.DATE, allowNull: true },
      aadhaar_number: {
        type: DataTypes.STRING(255), allowNull: true,
        comment: 'KMS-encrypted Aadhaar — Level 4 sensitivity',
      },
      aadhaar_encrypted_by_kms: { type: DataTypes.BOOLEAN, defaultValue: false },
      aadhaar_audit_logged: { type: DataTypes.BOOLEAN, defaultValue: false },
      aadhaar_last_verified: { type: DataTypes.DATE, allowNull: true },
      date_of_birth: { type: DataTypes.DATEONLY, allowNull: true },
      gender: { type: DataTypes.ENUM('male', 'female', 'other'), allowNull: true },
      father_name: { type: DataTypes.STRING(120), allowNull: true },
      mother_name: { type: DataTypes.STRING(120), allowNull: true },
      education_level: {
        type: DataTypes.ENUM('illiterate', 'primary', 'secondary', 'higher_secondary', 'graduate', 'post_graduate'),
        allowNull: true,
      },
      marital_status: {
        type: DataTypes.ENUM('single', 'married', 'divorced', 'widowed', 'prefer_not_to_say'),
        allowNull: true,
      },
      bank_account_verified: { type: DataTypes.BOOLEAN, defaultValue: false },
      gst_registered: { type: DataTypes.BOOLEAN, defaultValue: false },
      gst_number: { type: DataTypes.STRING(15), allowNull: true },
      fpo_member: { type: DataTypes.BOOLEAN, defaultValue: false },
      fpo_id: { type: DataTypes.INTEGER, allowNull: true },
      is_govt_land_owner: { type: DataTypes.BOOLEAN, defaultValue: false },
      land_ownership_type: {
        type: DataTypes.ENUM('owned', 'leased', 'shared', 'govt_allotted'),
        allowNull: true,
      },
      total_farm_size_hectares: { type: DataTypes.DECIMAL(10, 4), allowNull: true },
      primary_crop: { type: DataTypes.STRING(50), allowNull: true },
      secondary_crops: { type: DataTypes.TEXT, allowNull: true },
      years_farming_experience: { type: DataTypes.INTEGER, allowNull: true },
      onboarding_status: {
        type: DataTypes.ENUM('not_started', 'step1_personal', 'step2_contact', 'step3_location', 'step4_bank', 'completed'),
        defaultValue: 'not_started',
      },
      onboarding_completed_at: { type: DataTypes.DATE, allowNull: true },
      shc_status: {
        type: DataTypes.ENUM('captured', 'skipped'),
        allowNull: true,
      },
      profile_completeness_percentage: { type: DataTypes.INTEGER, defaultValue: 0 },
      is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    {
      sequelize, modelName: 'FarmerProfile', tableName: 'farmer_profiles',
      timestamps: true, underscored: true,
      indexes: [
        { fields: ['farmer_id'] },
        { fields: ['profile_uuid'] },
      ],
    }
  );

  return FarmerProfile;
};
