/**
 * S3 Service
 * Handles file uploads, downloads, deletion, and presigned URL generation.
 */

const s3 = require('../../config/s3');
const config = require('../../config');
const logger = require('../utils/logger');

/**
 * Uploads a file buffer to S3.
 * @param {Object} params
 * @param {Buffer} params.fileBuffer - File content
 * @param {string} params.key - S3 object key (path/filename)
 * @param {string} params.contentType - MIME type
 * @param {string} [params.bucket] - Bucket name override
 * @returns {Promise<Object>} S3 upload result with Location, Key, ETag
 */
const uploadFile = async ({ fileBuffer, key, contentType, bucket }) => {
  try {
    const params = {
      Bucket: bucket || config.s3.bucketName,
      Key: key,
      Body: fileBuffer,
      ContentType: contentType,
      ServerSideEncryption: 'aws:kms',
    };

    const result = await s3.upload(params).promise();
    logger.info(`File uploaded to S3: ${key}`);
    return result;
  } catch (err) {
    logger.error(`S3 upload failed for key ${key}:`, err.message);
    throw err;
  }
};

/**
 * Downloads a file from S3.
 * @param {string} key - S3 object key
 * @param {string} [bucket] - Bucket name override
 * @returns {Promise<Buffer>} File content buffer
 */
const downloadFile = async (key, bucket) => {
  try {
    const params = {
      Bucket: bucket || config.s3.bucketName,
      Key: key,
    };

    const result = await s3.getObject(params).promise();
    return result.Body;
  } catch (err) {
    logger.error(`S3 download failed for key ${key}:`, err.message);
    throw err;
  }
};

/**
 * Deletes a file from S3.
 * @param {string} key - S3 object key
 * @param {string} [bucket] - Bucket name override
 * @returns {Promise<void>}
 */
const deleteFile = async (key, bucket) => {
  try {
    const params = {
      Bucket: bucket || config.s3.bucketName,
      Key: key,
    };

    await s3.deleteObject(params).promise();
    logger.info(`File deleted from S3: ${key}`);
  } catch (err) {
    logger.error(`S3 delete failed for key ${key}:`, err.message);
    throw err;
  }
};

/**
 * Generates a presigned URL for temporary access to an S3 object.
 * @param {string} key - S3 object key
 * @param {number} [expirySeconds] - URL expiry in seconds
 * @param {string} [operation='getObject'] - S3 operation (getObject or putObject)
 * @returns {string} Presigned URL
 */
const getPresignedUrl = (key, expirySeconds, operation = 'getObject') => {
  const params = {
    Bucket: config.s3.bucketName,
    Key: key,
    Expires: expirySeconds || config.s3.presignedUrlExpiry,
  };

  return s3.getSignedUrl(operation, params);
};

module.exports = {
  uploadFile,
  downloadFile,
  deleteFile,
  getPresignedUrl,
};
