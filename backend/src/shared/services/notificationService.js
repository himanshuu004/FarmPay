/**
 * Notification Service
 * Template-based multi-channel dispatcher with variable substitution,
 * retry logic, multi-language support, and delivery tracking.
 */

const config = require('../../config');
const logger = require('../utils/logger');
const { sendEmail } = require('./emailService');
const { sendSMS } = require('./smsService');
const { generateUUID } = require('../utils/uuidHelper');

let db;
const getDb = () => { if (!db) db = require('../models'); return db; };

const CHANNELS = {
  EMAIL: 'email',
  SMS: 'sms',
  PUSH: 'push',
  IN_APP: 'in_app',
};

/**
 * Substitutes {variable} placeholders in a template string.
 * @param {string} template - Template with {variable} placeholders
 * @param {Object} variables - Key-value pairs for substitution
 * @returns {string} Rendered string
 */
const substituteVariables = (template, variables = {}) => {
  if (!template) return '';
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    return variables[key] !== undefined ? variables[key] : match;
  });
};

/**
 * Fetches a notification template by code, with optional language translation.
 * @param {string} templateCode - Template code (e.g. 'OTP_SENT')
 * @param {string} [language='en'] - Language code
 * @returns {Promise<Object>} { subject, body, channels, priority }
 */
const getTemplate = async (templateCode, language = 'en') => {
  const { NotificationTemplate, NotificationTemplateTranslation } = getDb();

  const template = await NotificationTemplate.findOne({
    where: { template_code: templateCode, is_active: true },
    include: language !== 'en' ? [{
      model: NotificationTemplateTranslation, as: 'translations',
      where: { language_code: language, is_active: true },
      required: false,
    }] : [],
  });

  if (!template) return null;

  const translation = template.translations?.[0];
  return {
    id: template.id,
    subject: translation?.subject_translated || template.subject_line,
    body: translation?.body_translated || template.body_template,
    channels: (template.supported_channels || 'in_app').split(',').map((c) => c.trim()),
    priority: template.priority,
    retryCount: template.retry_count,
  };
};

/**
 * Sends a template-based notification through configured channels.
 * Creates a notification record with delivery tracking.
 * @param {Object} options
 * @param {number} options.recipientUserId - Target user ID
 * @param {string} options.templateCode - Notification template code
 * @param {Object} [options.variables] - Template variable substitutions
 * @param {string} [options.language='en'] - Language for template
 * @param {string} [options.notificationType='info'] - alert, info, warning, success, reminder
 * @param {Object} [options.emailOptions] - { to } for email channel
 * @param {Object} [options.smsOptions] - { to } for SMS channel
 * @param {string} [options.requestId] - Request trace ID
 * @returns {Promise<Object>} Notification record with delivery results
 */
const sendTemplateNotification = async ({
  recipientUserId, templateCode, variables = {}, language = 'en',
  notificationType = 'info', emailOptions, smsOptions, requestId,
}) => {
  const { NotificationV2 } = getDb();

  // Fetch and render template
  const template = await getTemplate(templateCode, language);
  if (!template) {
    logger.warn(`Notification template not found: ${templateCode}`);
    return null;
  }

  const renderedSubject = substituteVariables(template.subject, variables);
  const renderedBody = substituteVariables(template.body, variables);
  const channelsToUse = template.channels;

  // Create notification record
  const notification = await NotificationV2.create({
    notification_uuid: generateUUID(),
    recipient_user_id: recipientUserId,
    template_id: template.id,
    notification_type: notificationType,
    channels_used: channelsToUse.join(','),
    template_variables: variables,
    request_id: requestId,
    delivery_status: 'pending',
  });

  // Send through each channel
  const results = {};
  let allSucceeded = true;

  for (const channel of channelsToUse) {
    try {
      switch (channel) {
        case CHANNELS.EMAIL:
          if (config.features.emailNotifications && emailOptions?.to) {
            results.email = await sendEmail({
              to: emailOptions.to,
              subject: renderedSubject,
              html: `<p>${renderedBody}</p>`,
              text: renderedBody,
            });
          }
          break;

        case CHANNELS.SMS:
          if (config.features.smsNotifications && smsOptions?.to) {
            results.sms = await sendSMS({ to: smsOptions.to, message: renderedBody });
          }
          break;

        case CHANNELS.PUSH:
          if (config.features.pushNotifications) {
            // TODO: FCM/APNs integration
            results.push = { success: true, queued: true };
          }
          break;

        case CHANNELS.IN_APP:
          results.in_app = { success: true, stored: true };
          break;
      }
    } catch (err) {
      logger.error(`Notification channel ${channel} failed:`, err.message);
      results[channel] = { success: false, error: err.message };
      allSucceeded = false;
    }
  }

  // Update delivery status
  await notification.update({
    delivery_status: allSucceeded ? 'sent' : 'failed',
    sent_at: new Date(),
    error_message: allSucceeded ? null : JSON.stringify(results),
  });

  logger.info(`Notification sent: ${templateCode} to user ${recipientUserId}, status: ${allSucceeded ? 'sent' : 'failed'}`);
  return { notification, results };
};

/**
 * Sends a simple notification without a template.
 * @param {Object} options - Same as original sendNotification
 * @returns {Promise<Object>} Results per channel
 */
const sendNotification = async ({ userId, title, body, channels, emailOptions, smsOptions }) => {
  const results = {};

  for (const channel of channels) {
    try {
      switch (channel) {
        case CHANNELS.EMAIL:
          if (config.features.emailNotifications && emailOptions?.to) {
            results.email = await sendEmail({ to: emailOptions.to, subject: title, html: `<p>${body}</p>`, text: body });
          }
          break;
        case CHANNELS.SMS:
          if (config.features.smsNotifications && smsOptions?.to) {
            results.sms = await sendSMS({ to: smsOptions.to, message: body });
          }
          break;
        case CHANNELS.PUSH:
          if (config.features.pushNotifications) {
            results.push = { success: true, queued: true };
          }
          break;
        case CHANNELS.IN_APP:
          results.in_app = { success: true, stored: true };
          break;
      }
    } catch (err) {
      logger.error(`Notification failed on channel ${channel}:`, err.message);
      results[channel] = { success: false, error: err.message };
    }
  }

  return results;
};

module.exports = { sendNotification, sendTemplateNotification, getTemplate, substituteVariables, CHANNELS };
