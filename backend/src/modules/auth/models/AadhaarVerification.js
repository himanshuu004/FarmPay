/**
 * AadhaarVerification Model
 * Tracks Aadhaar OTP-based step-up authentication sessions for DICE financial operations.
 *
 * Security:
 * - Raw Aadhaar number is NEVER stored — only SHA-256 hash + last 4 digits for display
 * - Session tokens expire in 15 minutes
 * - Rate limited per user (max 3 OTPs per 10 min)
 * - All attempts logged for audit
 */

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class AadhaarVerification extends Model {
    static associate(models) {
      AadhaarVerification.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
    }
  }

  AadhaarVerification.init(
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      verification_uuid: { type: DataTypes.STRING(36), allowNull: false, unique: true },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
      },
      // PII-safe Aadhaar storage
      aadhaar_hash: { type: DataTypes.STRING(64), allowNull: false }, // SHA-256
      aadhaar_last4: { type: DataTypes.STRING(4), allowNull: false },
      // OTP flow
      otp_request_id: { type: DataTypes.STRING(36), allowNull: false, unique: true },
      otp_code_hash: { type: DataTypes.STRING(64), allowNull: true }, // bcrypt hash of OTP
      otp_sent_at: { type: DataTypes.DATE, allowNull: false },
      otp_expires_at: { type: DataTypes.DATE, allowNull: false },
      verified_at: { type: DataTypes.DATE, allowNull: true },
      // Step-up session
      session_token_jti: { type: DataTypes.STRING(36), allowNull: true }, // JWT ID for revocation
      session_expires_at: { type: DataTypes.DATE, allowNull: true },
      // Audit
      ip_address: { type: DataTypes.STRING(45), allowNull: true },
      device_fingerprint: { type: DataTypes.STRING(255), allowNull: true },
      status: {
        type: DataTypes.ENUM('pending', 'verified', 'expired', 'failed', 'revoked'),
        allowNull: false,
        defaultValue: 'pending',
      },
      failure_reason: { type: DataTypes.STRING(255), allowNull: true },
      attempt_count: { type: DataTypes.INTEGER, defaultValue: 0 },
    },
    {
      sequelize,
      modelName: 'AadhaarVerification',
      tableName: 'aadhaar_verifications',
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ['verification_uuid'], unique: true },
        { fields: ['otp_request_id'], unique: true },
        { fields: ['user_id'] },
        { fields: ['status'] },
        { fields: ['session_expires_at'] },
      ],
    }
  );

  return AadhaarVerification;
};
