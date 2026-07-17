/**
 * Media Service
 * Upload, tag, and queue async processing jobs (thumbnails, compression) via RabbitMQ.
 */

const s3 = require('../../config/s3');
const config = require('../../config');
const logger = require('../utils/logger');
const { generateUUID } = require('../utils/uuidHelper');

let db;
const getDb = () => { if (!db) db = require('../models'); return db; };

/**
 * Determines asset type from MIME type.
 * @param {string} mimeType
 * @returns {string} image, video, audio, or pdf
 */
const resolveAssetType = (mimeType) => {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType === 'application/pdf') return 'pdf';
  return 'pdf'; // fallback
};

/**
 * Uploads a media asset to S3 and creates a database record.
 * Queues async processing jobs for thumbnails/compression.
 * @param {Object} params
 * @param {Buffer} params.fileBuffer - File content
 * @param {string} params.originalName - Original filename
 * @param {string} params.mimeType - MIME type
 * @param {number} params.fileSize - Size in bytes
 * @param {number} params.ownerId - Owner user ID
 * @param {number} params.uploadedBy - Uploader user ID
 * @param {string[]} [params.tags] - Tags to apply
 * @param {boolean} [params.isPublic=false]
 * @returns {Promise<Object>} Created media asset
 */
const uploadMedia = async ({ fileBuffer, originalName, mimeType, fileSize, ownerId, uploadedBy, tags = [], isPublic = false }) => {
  const { MediaAsset, MediaTag, MediaProcessingJob } = getDb();

  const assetUuid = generateUUID();
  const assetType = resolveAssetType(mimeType);
  const ext = originalName.split('.').pop();
  const s3Key = `media/${ownerId}/${assetType}/${assetUuid}.${ext}`;

  await s3.upload({
    Bucket: config.s3.bucketName,
    Key: s3Key,
    Body: fileBuffer,
    ContentType: mimeType,
  }).promise();

  const asset = await MediaAsset.create({
    asset_uuid: assetUuid,
    asset_type: assetType,
    owner_id: ownerId,
    original_filename: originalName,
    file_size_bytes: fileSize,
    mime_type: mimeType,
    s3_key: s3Key,
    s3_bucket: config.s3.bucketName,
    is_public: isPublic,
    uploaded_by: uploadedBy,
  });

  // Apply tags
  if (tags.length > 0) {
    await MediaTag.bulkCreate(
      tags.map((tag) => ({ media_asset_id: asset.id, tag_name: tag.toLowerCase() })),
      { ignoreDuplicates: true }
    );
  }

  // Queue processing jobs for images
  if (assetType === 'image') {
    await MediaProcessingJob.bulkCreate([
      { media_asset_id: asset.id, job_type: 'thumbnail' },
      { media_asset_id: asset.id, job_type: 'compress' },
    ]);

    // Publish to RabbitMQ for async processing
    try {
      const { getChannel } = require('../../config/rabbitmq');
      const channel = await getChannel();
      if (channel) {
        const message = JSON.stringify({ assetId: asset.id, assetUuid, s3Key, jobs: ['thumbnail', 'compress'] });
        channel.publish(config.rabbitmq.exchange, 'media.process', Buffer.from(message));
        logger.info(`Media processing jobs queued for asset ${assetUuid}`);
      }
    } catch (err) {
      logger.warn('Failed to queue media processing job:', err.message);
    }
  }

  logger.info(`Media uploaded: ${assetUuid}, type: ${assetType}`);
  return asset;
};

/**
 * Adds a rendition (processed version) for a media asset.
 * @param {Object} params
 * @param {number} params.mediaAssetId
 * @param {string} params.renditionType - e.g. 'thumbnail_sm', 'thumbnail_lg', 'compressed'
 * @param {number} params.fileSize
 * @param {string} params.dimensions - e.g. '150x150'
 * @param {string} params.s3Key
 * @returns {Promise<Object>}
 */
const addRendition = async ({ mediaAssetId, renditionType, fileSize, dimensions, s3Key }) => {
  const { MediaRendition } = getDb();
  return MediaRendition.create({ media_asset_id: mediaAssetId, rendition_type: renditionType, file_size_bytes: fileSize, dimensions, s3_key: s3Key });
};

/**
 * Logs a media access event.
 * @param {number} mediaAssetId
 * @param {number} userId
 * @param {string} ipAddress
 */
const logMediaAccess = async (mediaAssetId, userId, ipAddress) => {
  const { MediaAccessLog } = getDb();
  await MediaAccessLog.create({ media_asset_id: mediaAssetId, accessed_by: userId, ip_address: ipAddress });
};

module.exports = { uploadMedia, addRendition, logMediaAccess, resolveAssetType };
