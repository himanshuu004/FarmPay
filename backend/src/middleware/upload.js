/**
 * Multer Upload Middleware
 * Configures file upload handling with size limits and MIME type validation.
 * Files are stored in memory buffer for S3 upload (not disk).
 */

const multer = require('multer');
const { error } = require('../shared/utils/responseHelper');
const STATUS_CODES = require('../shared/constants/statusCodes');
const ERROR_CODES = require('../shared/constants/errorCodes');

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/** Allowed MIME types grouped by category */
const ALLOWED_TYPES = {
  document: [
    'application/pdf',
    'image/jpeg', 'image/png', 'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ],
  image: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  media: [
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'video/mp4', 'video/quicktime', 'video/webm',
    'audio/mpeg', 'audio/wav', 'audio/ogg',
    'application/pdf',
  ],
};

/**
 * Creates a Multer upload middleware with the given options.
 * @param {Object} [options]
 * @param {string} [options.category='media'] - File category: 'document', 'image', 'media'
 * @param {number} [options.maxSize] - Max file size in bytes
 * @param {number} [options.maxFiles=5] - Max number of files per request
 * @returns {Function} Multer middleware
 */
const createUpload = (options = {}) => {
  const { category = 'media', maxSize = MAX_FILE_SIZE, maxFiles = 5 } = options;
  const allowedMimeTypes = ALLOWED_TYPES[category] || ALLOWED_TYPES.media;

  const storage = multer.memoryStorage();

  const fileFilter = (req, file, cb) => {
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} is not allowed`), false);
    }
  };

  return multer({
    storage,
    fileFilter,
    limits: {
      fileSize: maxSize,
      files: maxFiles,
    },
  });
};

/** Single document upload */
const uploadDocument = createUpload({ category: 'document', maxFiles: 1 }).single('file');

/** Single image upload */
const uploadImage = createUpload({ category: 'image', maxFiles: 1 }).single('file');

/** Multiple media upload (up to 5 files) */
const uploadMedia = createUpload({ category: 'media', maxFiles: 5 }).array('files', 5);

/**
 * Error handling wrapper for Multer errors.
 * @param {string} fieldType - 'single' or 'array'
 * @returns {Function} Express middleware
 */
const handleUploadErrors = (uploadFn) => {
  return (req, res, next) => {
    uploadFn(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return error(res, {
            message: `File exceeds maximum size of ${MAX_FILE_SIZE / (1024 * 1024)}MB`,
            errorCode: ERROR_CODES.FILE_TOO_LARGE,
            statusCode: STATUS_CODES.BAD_REQUEST,
          });
        }
        return error(res, {
          message: err.message,
          errorCode: ERROR_CODES.FILE_UPLOAD_FAILED,
          statusCode: STATUS_CODES.BAD_REQUEST,
        });
      }
      if (err) {
        return error(res, {
          message: err.message,
          errorCode: ERROR_CODES.FILE_TYPE_NOT_ALLOWED,
          statusCode: STATUS_CODES.BAD_REQUEST,
        });
      }
      next();
    });
  };
};

module.exports = {
  createUpload,
  uploadDocument: handleUploadErrors(uploadDocument),
  uploadImage: handleUploadErrors(uploadImage),
  uploadMedia: handleUploadErrors(uploadMedia),
};
