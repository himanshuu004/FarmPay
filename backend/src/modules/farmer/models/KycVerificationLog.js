/**
 * KycVerificationLog Model
 * Tracks KYC document verification status, verifier identity, and rejection reasons.
 */

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class KycVerificationLog extends Model {
    static associate(models) {
      KycVerificationLog.belongsTo(models.User, { foreignKey: 'farmer_id', as: 'farmer' });
    }
  }

  KycVerificationLog.init(
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      farmer_id: {
        type: DataTypes.INTEGER, allowNull: false,
        references: { model: 'users', key: 'id' },
      },
      kyc_document_type: {
        type: DataTypes.ENUM('aadhaar', 'pan', 'drivers_license', 'voter_id', 'land_document'),
        allowNull: false,
      },
      document_number: { type: DataTypes.STRING(50), allowNull: true },
      document_image_url: { type: DataTypes.STRING(255), allowNull: true },
      verified_at: { type: DataTypes.DATE, allowNull: true },
      verified_by_admin: { type: DataTypes.INTEGER, allowNull: true },
      verification_status: {
        type: DataTypes.ENUM('pending', 'verified', 'rejected', 'expired'),
        defaultValue: 'pending',
      },
      rejection_reason: { type: DataTypes.TEXT, allowNull: true },
      is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    {
      sequelize, modelName: 'KycVerificationLog', tableName: 'kyc_verification_logs',
      timestamps: true, underscored: true,
      indexes: [
        { fields: ['farmer_id', 'kyc_document_type'] },
        { fields: ['verification_status'] },
      ],
    }
  );

  return KycVerificationLog;
};
