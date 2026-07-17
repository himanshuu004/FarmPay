/**
 * KMS Service
 * Encrypts and decrypts sensitive data using AWS Key Management Service.
 * Used for RESTRICTED-level data (PII, financial records).
 */

const AWS = require('aws-sdk');
const config = require('../../config');
const logger = require('../utils/logger');

const kms = new AWS.KMS({
  region: config.kms.region,
  accessKeyId: config.aws.accessKeyId,
  secretAccessKey: config.aws.secretAccessKey,
});

/**
 * Encrypts plaintext using the configured KMS key.
 * @param {string} plainText - Data to encrypt
 * @returns {Promise<string>} Base64-encoded ciphertext
 */
const encrypt = async (plainText) => {
  try {
    const params = {
      KeyId: config.kms.keyId,
      Plaintext: Buffer.from(plainText, 'utf8'),
    };

    const result = await kms.encrypt(params).promise();
    return result.CiphertextBlob.toString('base64');
  } catch (err) {
    logger.error('KMS encryption failed:', err.message);
    throw err;
  }
};

/**
 * Decrypts KMS-encrypted ciphertext.
 * @param {string} cipherText - Base64-encoded ciphertext
 * @returns {Promise<string>} Decrypted plaintext
 */
const decrypt = async (cipherText) => {
  try {
    const params = {
      CiphertextBlob: Buffer.from(cipherText, 'base64'),
    };

    const result = await kms.decrypt(params).promise();
    return result.Plaintext.toString('utf8');
  } catch (err) {
    logger.error('KMS decryption failed:', err.message);
    throw err;
  }
};

/**
 * Generates a data key for envelope encryption.
 * @returns {Promise<{ plaintext: Buffer, ciphertext: string }>}
 */
const generateDataKey = async () => {
  try {
    const params = {
      KeyId: config.kms.keyId,
      KeySpec: 'AES_256',
    };

    const result = await kms.generateDataKey(params).promise();
    return {
      plaintext: result.Plaintext,
      ciphertext: result.CiphertextBlob.toString('base64'),
    };
  } catch (err) {
    logger.error('KMS data key generation failed:', err.message);
    throw err;
  }
};

module.exports = { encrypt, decrypt, generateDataKey };
