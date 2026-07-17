/**
 * Document Model
 * Stores metadata for documents (KYC papers, land records, contracts, invoices).
 * Actual files are stored in S3; this model tracks metadata and verification status.
 */

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Document extends Model {
    static associate(models) {
      // A document may reference a Media record for the actual file
      Document.belongsTo(models.Media, {
        foreignKey: 'media_id',
        as: 'media',
      });
    }
  }

  Document.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      ownerId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'owner_id',
        comment: 'User or entity that owns this document',
      },
      ownerType: {
        type: DataTypes.STRING(50),
        allowNull: false,
        field: 'owner_type',
        comment: 'Type of owner (farmer, fpo, trust)',
      },
      documentType: {
        type: DataTypes.STRING(50),
        allowNull: false,
        field: 'document_type',
        comment: 'Type (aadhaar, pan, land_record, bank_passbook, invoice, contract)',
      },
      documentNumber: {
        type: DataTypes.STRING(100),
        allowNull: true,
        field: 'document_number',
        comment: 'Document reference number (encrypted for sensitive docs)',
      },
      mediaId: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'media_id',
        comment: 'Reference to the uploaded file in the media table',
      },
      sensitivityLevel: {
        type: DataTypes.ENUM('public', 'internal', 'confidential', 'restricted'),
        defaultValue: 'confidential',
        field: 'sensitivity_level',
      },
      verificationStatus: {
        type: DataTypes.ENUM('pending', 'verified', 'rejected', 'expired'),
        defaultValue: 'pending',
        field: 'verification_status',
      },
      verifiedBy: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'verified_by',
      },
      verifiedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'verified_at',
      },
      expiresAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'expires_at',
        comment: 'Document expiry date, if applicable',
      },
      metadata: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: 'Additional document-specific metadata',
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        field: 'is_active',
      },
    },
    {
      sequelize,
      modelName: 'Document',
      tableName: 'documents',
      timestamps: true,
      paranoid: true, // Soft-delete for compliance — never hard-delete documents
      indexes: [
        { fields: ['owner_id', 'owner_type'] },
        { fields: ['document_type'] },
        { fields: ['verification_status'] },
      ],
    }
  );

  return Document;
};
