/**
 * ConsentRecord Model
 * Tracks farmer consent for various platform activities (KYC, lending, data processing, etc.).
 */

const { Model } = require('sequelize');
const { CONSENT_PURPOSE_VALUES } = require('../../../shared/constants/consentPurposes');

module.exports = (sequelize, DataTypes) => {
  class ConsentRecord extends Model {
    static associate(models) {
      ConsentRecord.belongsTo(models.User, {
        foreignKey: 'farmer_id',
        as: 'farmer',
      });
    }
  }

  ConsentRecord.init(
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      consent_uuid: { type: DataTypes.STRING(36), allowNull: false, unique: true },
      farmer_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
      },
      // Purpose-bound (DPDP). model_improvement is its own purpose — see
      // shared/constants/consentPurposes.js. Extended for Allied KCC (coop,
      // evidence, biometric, voice, training).
      consent_type: {
        type: DataTypes.ENUM(...CONSENT_PURPOSE_VALUES),
        allowNull: false,
      },
      consent_version: { type: DataTypes.STRING(20), allowNull: false },
      accepted: { type: DataTypes.BOOLEAN, allowNull: false },
      accepted_at: { type: DataTypes.DATE, allowNull: false },
      withdrawn_at: { type: DataTypes.DATE, allowNull: true },
      ip_address: { type: DataTypes.STRING(45), allowNull: true },
      user_agent: { type: DataTypes.TEXT, allowNull: true },
      is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
    },
    {
      sequelize,
      modelName: 'ConsentRecord',
      tableName: 'consent_records',
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ['consent_uuid'], unique: true },
        { fields: ['farmer_id', 'consent_type'] },
      ],
    }
  );

  return ConsentRecord;
};
