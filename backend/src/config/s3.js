/**
 * AWS S3 Client Configuration
 * Creates and exports a configured AWS S3 instance.
 */

const AWS = require('aws-sdk');
const config = require('./index');

/**
 * Configured AWS S3 instance for file uploads, downloads, and presigned URLs.
 */
const s3 = new AWS.S3({
  region: config.s3.bucketRegion,
  accessKeyId: config.aws.accessKeyId,
  secretAccessKey: config.aws.secretAccessKey,
  signatureVersion: 'v4',
});

module.exports = s3;
