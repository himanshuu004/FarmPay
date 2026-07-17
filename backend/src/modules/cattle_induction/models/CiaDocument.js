/**
 * CiaDocument — one uploaded document/evidence file for an application, mapped to
 * a checklist key. Content-addressed and lossless (Convention 9): we store the
 * object-store ref + a content hash + preserved capture metadata (EXIF/GPS/device)
 * — never re-compress. The checklist engine gates submit until every MANDATORY
 * key for the pinned scheme version is present.
 */
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class CiaDocument extends Model {
    static associate(models) {
      if (models.CiaApplication) CiaDocument.belongsTo(models.CiaApplication, { foreignKey: 'application_id', as: 'application' });
    }
  }
  CiaDocument.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    document_uuid: { type: DataTypes.UUID, allowNull: false, unique: true },
    application_id: { type: DataTypes.INTEGER, allowNull: false },
    checklist_key: { type: DataTypes.STRING(60), allowNull: false }, // maps to scheme doc_checklist[].key
    doc_ref: { type: DataTypes.STRING(200), allowNull: false },      // object-store ref (content-addressed)
    content_hash: { type: DataTypes.STRING(64), allowNull: false },  // sha256 of bytes; dedupe/integrity
    mime_type: { type: DataTypes.STRING(60), allowNull: true },
    capture_meta: { type: DataTypes.JSONB, allowNull: true },        // EXIF/GPS/device — preserved lossless
    uploaded_by_user_id: { type: DataTypes.INTEGER, allowNull: true },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    sequelize, modelName: 'CiaDocument', tableName: 'cia_documents',
    timestamps: true, underscored: true,
    indexes: [
      { fields: ['application_id'] },
      // one active doc per checklist key per application (re-upload replaces).
      { fields: ['application_id', 'checklist_key'], unique: true, name: 'cia_documents_app_key_uniq' },
    ],
  });
  return CiaDocument;
};
