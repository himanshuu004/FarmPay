/**
 * SMS Service
 * Sends SMS messages via a configurable gateway provider.
 * Currently a stub — implement the provider-specific logic when integrating.
 */

const config = require('../../config');
const logger = require('../utils/logger');

/**
 * Sends an SMS message.
 * @param {Object} options
 * @param {string} options.to - Recipient phone number (E.164 format, e.g. +919876543210)
 * @param {string} options.message - SMS body text
 * @param {string} [options.templateId] - DLT template ID (required for Indian SMS regulations)
 * @returns {Promise<Object>} Provider response with messageId
 */
const sendSMS = async ({ to, message, templateId }) => {
  try {
    logger.info(`Sending SMS to ${to} via ${config.sms.provider}`);

    // TODO: Implement provider-specific logic (Twilio, MSG91, etc.)
    // This is a stub that logs the attempt and returns a mock response.
    // Replace with actual API calls when the SMS provider is finalized.

    const result = {
      success: true,
      messageId: `sms_${Date.now()}`,
      provider: config.sms.provider,
      to,
    };

    logger.info(`SMS sent to ${to}, messageId: ${result.messageId}`);
    return result;
  } catch (err) {
    logger.error(`SMS send failed to ${to}:`, err.message);
    throw err;
  }
};

/**
 * Sends an OTP via SMS.
 * @param {string} phoneNumber - Recipient phone number (E.164)
 * @param {string} otp - OTP code
 * @returns {Promise<Object>}
 */
const sendOTP = async (phoneNumber, otp) => {
  const message = `Your FarmerPay OTP is ${otp}. Valid for ${config.otp.expiryMinutes} minutes. Do not share.`;
  return sendSMS({ to: phoneNumber, message });
};

module.exports = { sendSMS, sendOTP };
