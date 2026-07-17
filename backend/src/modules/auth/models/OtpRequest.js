/**
 * OtpRequest Model
 * Tracks OTP codes sent for registration, login, password reset, and contact updates.
 */

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class OtpRequest extends Model {
    static associate() {
      // No direct FK to users — OTP can be sent before user exists (registration)
    }
  }

  OtpRequest.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      otp_request_id: {
        type: DataTypes.STRING(36),
        allowNull: false,
        unique: true,
        comment: 'Public-facing UUID returned to the client',
      },
      mobile: {
        type: DataTypes.STRING(13),
        allowNull: true,
      },
      email: {
        type: DataTypes.STRING(120),
        allowNull: true,
      },
      otp_code: {
        type: DataTypes.STRING(64), // SHA-256 hex of the OTP (never the plaintext 6 digits)
        allowNull: false,
        comment: 'Hashed OTP code',
      },
      purpose: {
        type: DataTypes.ENUM('register', 'login', 'reset_password', 'update_contact'),
        allowNull: false,
      },
      sent_via: {
        type: DataTypes.ENUM('sms', 'email', 'both'),
        allowNull: false,
        defaultValue: 'sms',
      },
      attempt_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: 'Number of verification attempts made',
      },
      max_attempts: {
        type: DataTypes.INTEGER,
        defaultValue: 3,
      },
      expires_at: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      verified_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Timestamp when OTP was successfully verified',
      },
      request_timestamp: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      modelName: 'OtpRequest',
      tableName: 'otp_requests',
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ['mobile', 'purpose', 'created_at'], name: 'idx_otp_mobile_purpose' },
        { fields: ['email', 'purpose', 'created_at'], name: 'idx_otp_email_purpose' },
        { fields: ['otp_request_id'], name: 'idx_otp_request_id' },
      ],
    }
  );

  return OtpRequest;
};
