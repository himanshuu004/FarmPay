/**
 * Media Model
 * Stores references to uploaded files (images, videos, audio, documents).
 * The actual files live in S3; this model tracks metadata.
 */

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Media extends Model {
    static associate(models) {
      // Polymorphic: any entity can have media attachments
    }
  }

  Media.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      uploadedBy: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'uploaded_by',
        comment: 'User who uploaded this file',
      },
      fileName: {
        type: DataTypes.STRING(255),
        allowNull: false,
        field: 'file_name',
      },
      originalName: {
        type: DataTypes.STRING(255),
        allowNull: false,
        field: 'original_name',
        comment: 'Original filename from the upload',
      },
      mimeType: {
        type: DataTypes.STRING(100),
        allowNull: false,
        field: 'mime_type',
      },
      fileSize: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'file_size',
        comment: 'File size in bytes',
      },
      s3Key: {
        type: DataTypes.STRING(500),
        allowNull: false,
        field: 's3_key',
        comment: 'S3 object key for retrieval',
      },
      s3Bucket: {
        type: DataTypes.STRING(100),
        allowNull: false,
        field: 's3_bucket',
      },
      entityType: {
        type: DataTypes.STRING(50),
        allowNull: true,
        field: 'entity_type',
        comment: 'Polymorphic type (e.g. farmer, crop, transaction)',
      },
      entityId: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'entity_id',
        comment: 'Polymorphic ID of the owning entity',
      },
      category: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: 'Category tag (e.g. profile_photo, land_record, invoice)',
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        field: 'is_active',
      },
    },
    {
      sequelize,
      modelName: 'Media',
      tableName: 'media',
      timestamps: true,
      indexes: [
        { fields: ['entity_type', 'entity_id'] },
        { fields: ['uploaded_by'] },
        { fields: ['category'] },
      ],
    }
  );

  return Media;
};
