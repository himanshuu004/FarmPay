/**
 * Email Service
 * Sends emails via AWS SES or SMTP (Nodemailer) based on configuration.
 */

const AWS = require('aws-sdk');
const nodemailer = require('nodemailer');
const config = require('../../config');
const logger = require('../utils/logger');

let transporter = null;

/**
 * Initializes the email transporter based on the configured provider.
 * @returns {Object} Nodemailer transporter
 */
const getTransporter = () => {
  if (transporter) return transporter;

  if (config.email.provider === 'ses') {
    const ses = new AWS.SES({
      region: config.email.sesRegion,
      accessKeyId: config.aws.accessKeyId,
      secretAccessKey: config.aws.secretAccessKey,
    });

    transporter = nodemailer.createTransport({ SES: { ses, aws: AWS } });
  } else {
    transporter = nodemailer.createTransport({
      host: config.email.smtp.host,
      port: config.email.smtp.port,
      secure: config.email.smtp.secure,
      auth: {
        user: config.email.smtp.user,
        pass: config.email.smtp.password,
      },
    });
  }

  return transporter;
};

/**
 * Sends an email.
 * @param {Object} options
 * @param {string} options.to - Recipient email address
 * @param {string} options.subject - Email subject
 * @param {string} [options.text] - Plain text body
 * @param {string} [options.html] - HTML body
 * @param {Array} [options.attachments] - Nodemailer attachment objects
 * @returns {Promise<Object>} Send result with messageId
 */
const sendEmail = async ({ to, subject, text, html, attachments }) => {
  try {
    const mail = getTransporter();

    const mailOptions = {
      from: `${config.email.fromName} <${config.email.from}>`,
      to,
      subject,
      text,
      html,
      attachments,
    };

    const result = await mail.sendMail(mailOptions);
    logger.info(`Email sent to ${to}, messageId: ${result.messageId}`);
    return result;
  } catch (err) {
    logger.error(`Email send failed to ${to}:`, err.message);
    throw err;
  }
};

module.exports = { sendEmail };
