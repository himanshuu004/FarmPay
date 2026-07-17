/**
 * Document Service
 * Upload to S3, pre-signed URLs (15min), encryption for sensitive docs, version control.
 */

const s3 = require('../../config/s3');
const config = require('../../config');
const logger = require('../utils/logger');
const { generateUUID } = require('../utils/uuidHelper');

const PRESIGNED_EXPIRY = 900; // 15 minutes

let db;
const getDb = () => { if (!db) db = require('../models'); return db; };

/**
 * Uploads a document to S3 and creates a database record.
 * @param {Object} params
 * @param {Buffer} params.fileBuffer - File content
 * @param {string} params.originalName - Original filename
 * @param {string} params.mimeType - MIME type
 * @param {number} params.fileSize - Size in bytes
 * @param {number} params.ownerId - Owner user ID
 * @param {number} params.uploadedBy - Uploader user ID
 * @param {string} params.documentType - Document type enum value
 * @param {boolean} [params.encrypt=false] - Whether to encrypt with KMS
 * @returns {Promise<Object>} Created document record
 */
const uploadDocument = async ({ fileBuffer, originalName, mimeType, fileSize, ownerId, uploadedBy, documentType, encrypt = false }) => {
  const { DocumentV2, DocumentVersion } = getDb();

  const docUuid = generateUUID();
  const ext = originalName.split('.').pop();
  const s3Key = `documents/${ownerId}/${docUuid}.${ext}`;

  const uploadParams = {
    Bucket: config.s3.bucketName,
    Key: s3Key,
    Body: fileBuffer,
    ContentType: mimeType,
  };

  // Encrypt sensitive documents with KMS
  if (encrypt) {
    uploadParams.ServerSideEncryption = 'aws:kms';
    uploadParams.SSEKMSKeyId = config.kms.keyId;
  }

  await s3.upload(uploadParams).promise();

  const document = await DocumentV2.create({
    document_uuid: docUuid,
    owner_id: ownerId,
    document_type: documentType,
    document_name: originalName,
    file_extension: ext,
    file_size_bytes: fileSize,
    mime_type: mimeType,
    s3_key: s3Key,
    s3_bucket: config.s3.bucketName,
    uploaded_by: uploadedBy,
    is_encrypted: encrypt,
    encryption_key_id: encrypt ? config.kms.keyId : null,
  });

  // Create version 1
  await DocumentVersion.create({
    document_id: document.id,
    version_number: 1,
    s3_key: s3Key,
    created_by: uploadedBy,
  });

  logger.info(`Document uploaded: ${docUuid}, type: ${documentType}, encrypted: ${encrypt}`);
  return document;
};

/**
 * Generates a pre-signed URL for document download (15min expiry).
 * @param {string} s3Key - S3 object key
 * @returns {string} Pre-signed URL
 */
const getPresignedUrl = (s3Key) => {
  return s3.getSignedUrl('getObject', {
    Bucket: config.s3.bucketName,
    Key: s3Key,
    Expires: PRESIGNED_EXPIRY,
  });
};

/**
 * Creates a new version of an existing document.
 * @param {number} documentId - Document ID
 * @param {Buffer} fileBuffer - New file content
 * @param {string} mimeType - MIME type
 * @param {number} createdBy - User ID
 * @returns {Promise<Object>} Version record
 */
const createVersion = async (documentId, fileBuffer, mimeType, createdBy) => {
  const { DocumentV2, DocumentVersion } = getDb();

  const doc = await DocumentV2.findByPk(documentId);
  if (!doc) throw Object.assign(new Error('Document not found'), { statusCode: 404 });

  const lastVersion = await DocumentVersion.findOne({
    where: { document_id: documentId },
    order: [['version_number', 'DESC']],
  });

  const newVersionNumber = (lastVersion?.version_number || 0) + 1;
  const s3Key = `documents/${doc.owner_id}/${doc.document_uuid}_v${newVersionNumber}.${doc.file_extension}`;

  await s3.upload({ Bucket: config.s3.bucketName, Key: s3Key, Body: fileBuffer, ContentType: mimeType }).promise();

  const version = await DocumentVersion.create({
    document_id: documentId,
    version_number: newVersionNumber,
    s3_key: s3Key,
    created_by: createdBy,
  });

  // Update main doc s3_key to latest version
  await doc.update({ s3_key: s3Key });

  logger.info(`Document version ${newVersionNumber} created for doc ${documentId}`);
  return version;
};

/**
 * Logs a document access event.
 * @param {number} documentId
 * @param {number} userId
 * @param {string} accessType - view, download, print, export
 * @param {Object} meta - { ipAddress, deviceInfo }
 */
const logAccess = async (documentId, userId, accessType, meta = {}) => {
  const { DocumentAccessLog } = getDb();
  await DocumentAccessLog.create({
    document_id: documentId,
    accessed_by: userId,
    access_type: accessType,
    ip_address: meta.ipAddress,
    device_info: meta.deviceInfo,
  });
};

module.exports = { uploadDocument, getPresignedUrl, createVersion, logAccess, PRESIGNED_EXPIRY };
