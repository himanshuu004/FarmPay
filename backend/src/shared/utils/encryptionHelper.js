/**
 * Encryption Helper
 * Password hashing (bcrypt) and symmetric encryption (AES-256-GCM).
 */

const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const SALT_ROUNDS = 12;
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

/**
 * Hashes a plaintext password using bcrypt.
 * @param {string} plainText - Password to hash
 * @returns {Promise<string>} Hashed password
 */
const hashPassword = async (plainText) => {
  const salt = await bcrypt.genSalt(SALT_ROUNDS);
  return bcrypt.hash(plainText, salt);
};

/**
 * Compares a plaintext password against a bcrypt hash.
 * @param {string} plainText - Password to verify
 * @param {string} hash - Stored bcrypt hash
 * @returns {Promise<boolean>} Whether the password matches
 */
const comparePassword = async (plainText, hash) => {
  return bcrypt.compare(plainText, hash);
};

/**
 * Encrypts data using AES-256-GCM.
 * @param {string} text - Plaintext to encrypt
 * @param {string} encryptionKey - 32-byte hex key
 * @returns {string} Encrypted string in format: iv:authTag:ciphertext (hex-encoded)
 */
const encrypt = (text, encryptionKey) => {
  const key = Buffer.from(encryptionKey, 'hex');
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag().toString('hex');

  // Format: iv:authTag:ciphertext
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
};

/**
 * Decrypts data encrypted with AES-256-GCM.
 * @param {string} encryptedText - Encrypted string in format iv:authTag:ciphertext
 * @param {string} encryptionKey - 32-byte hex key
 * @returns {string} Decrypted plaintext
 */
const decrypt = (encryptedText, encryptionKey) => {
  const key = Buffer.from(encryptionKey, 'hex');
  const [ivHex, authTagHex, ciphertext] = encryptedText.split(':');

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
};

/**
 * Generates a cryptographically secure random hex string.
 * @param {number} [bytes=32] - Number of random bytes
 * @returns {string} Hex-encoded random string
 */
const generateRandomHex = (bytes = 32) => {
  return crypto.randomBytes(bytes).toString('hex');
};

module.exports = {
  hashPassword,
  comparePassword,
  encrypt,
  decrypt,
  generateRandomHex,
};
