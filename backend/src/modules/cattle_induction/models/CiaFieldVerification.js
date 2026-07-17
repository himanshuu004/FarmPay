/**
 * CiaFieldVerification — Route Supervisor field check (offline-first, in-app).
 * Geo-tag (PostGIS) + live-captured photos are mandatory; media is content-
 * addressed and lossless (Convention 9/32). Result drives FORWARDED_TO_DUSS |
 * RETURNED_FOR_CORRECTION | REJECTED.
 */
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class CiaFieldVerification extends Model {
    static associate(models) {
      if (models.CiaApplication) CiaFieldVerification.belongsTo(models.CiaApplication, { foreignKey: 'application_id', as: 'application' });
    }
  }
  CiaFieldVerification.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    application_id: { type: DataTypes.INTEGER, allowNull: false, unique: true },
    supervisor_user_id: { type: DataTypes.INTEGER, allowNull: false },
    result: { type: DataTypes.STRING(16), allowNull: false }, // APPROVED | RETURNED | REJECTED
    remarks: { type: DataTypes.STRING(1000), allowNull: true },
    identity_ok: { type: DataTypes.BOOLEAN, allowNull: true },
    membership_ok: { type: DataTypes.BOOLEAN, allowNull: true },
    milk_pouring_ok: { type: DataTypes.BOOLEAN, allowNull: true },
    existing_cattle_note: { type: DataTypes.STRING(500), allowNull: true },
    // PostGIS geography points; geometry type wired in migration. Store lat/lng too for portability.
    shed_lat: { type: DataTypes.DECIMAL(9, 6), allowNull: true },
    shed_lng: { type: DataTypes.DECIMAL(9, 6), allowNull: true },
    residence_lat: { type: DataTypes.DECIMAL(9, 6), allowNull: true },
    residence_lng: { type: DataTypes.DECIMAL(9, 6), allowNull: true },
    media_refs: { type: DataTypes.JSONB, allowNull: true }, // [{ref, hash, exif}], live-capture only
    captured_offline: { type: DataTypes.BOOLEAN, defaultValue: false },
    verified_at: { type: DataTypes.DATE, allowNull: false },
    synced_at: { type: DataTypes.DATE, allowNull: true },
  }, {
    sequelize, modelName: 'CiaFieldVerification', tableName: 'cia_field_verifications',
    timestamps: true, underscored: true,
  });
  return CiaFieldVerification;
};
