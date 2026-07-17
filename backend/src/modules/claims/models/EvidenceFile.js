/**
 * EvidenceFile — content-addressed, EXIF-preserved claim evidence (§5.2;
 * CLAUDE.md #9 "evidence is lossless"). content_hash is the tamper/dedup key
 * (unique per claim); GPS + device meta + captured_at are preserved from EXIF.
 * Re-compression is rejected upstream by comparing the client hash to the bytes.
 */
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class EvidenceFile extends Model {
    static associate(models) {
      if (models.ClaimCase) EvidenceFile.belongsTo(models.ClaimCase, { foreignKey: 'claim_id', as: 'claim' });
    }
  }
  EvidenceFile.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    evidence_uuid: { type: DataTypes.UUID, allowNull: false, unique: true },
    claim_id: { type: DataTypes.INTEGER, allowNull: false },
    kind: { type: DataTypes.STRING(30), allowNull: false }, // one of claimDocs kinds
    object_key: { type: DataTypes.STRING(500), allowNull: false }, // lossless object store
    content_hash: { type: DataTypes.STRING(64), allowNull: false }, // SHA-256
    gps_lat: { type: DataTypes.DECIMAL(10, 7), allowNull: true },
    gps_lng: { type: DataTypes.DECIMAL(10, 7), allowNull: true },
    captured_at: { type: DataTypes.DATE, allowNull: true }, // device timestamp
    device_meta: { type: DataTypes.JSONB, allowNull: true }, // model, app version
    uploaded_offline: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    sequelize, modelName: 'EvidenceFile', tableName: 'evidence_files',
    timestamps: true, underscored: true,
    indexes: [
      { fields: ['claim_id'] },
      { fields: ['content_hash'] },
      { unique: true, fields: ['claim_id', 'kind'] }, // one doc per kind per claim
    ],
  });
  return EvidenceFile;
};
