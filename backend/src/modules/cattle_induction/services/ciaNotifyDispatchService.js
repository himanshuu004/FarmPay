/**
 * CIA notification dispatcher (PRD Part 11). Turns one CIA domain_event into a
 * farmer-facing notification: an in-app NotificationV2 row (the real delivery) plus
 * best-effort SMS via the platform gateway stub. Called by the outbox relay.
 * Informational only — never moves money or changes state.
 *
 * It creates the NotificationV2 row DIRECTLY rather than via the shared
 * notificationService, because that service transitively requires the email path
 * (nodemailer) which is not provisioned; in-app + SMS is all CIA needs.
 *
 * Recipient resolution: event.farmer_id (farmer-authored events) → else the linked
 * application's farmer_ref → the CoopMembership app user. Staff recipients are a
 * documented follow-up (no role→user assignment model yet).
 */
const crypto = require('crypto');
const config = require('../../../config');
const logger = require('../../../shared/utils/logger');
const { sendSMS } = require('../../../shared/services/smsService');
const { CIA_EVENT_NOTIFICATIONS } = require('../constants/ciaNotifications');

let db;
const getDb = () => { if (!db) db = require('../../../shared/models'); return db; };

/** Resolve the farmer's app user id for an event, or null if not resolvable. */
const resolveFarmerUserId = async (event) => {
  if (event.farmer_id) return event.farmer_id;
  const { CiaApplication, CoopMembership } = getDb();
  let farmerRef = null;
  if (event.aggregate_type === 'CiaApplication') {
    const app = await CiaApplication.findOne({ where: { application_uuid: event.aggregate_id } });
    farmerRef = app && app.farmer_ref;
  }
  if (!farmerRef) return null;
  const membership = await CoopMembership.findOne({ where: { farmer_ref: farmerRef } });
  return (membership && membership.user_id) || null;
};

/** Shallow-stringify payload values so substitution never yields [object Object]. */
const flatten = (payload = {}) => {
  const out = {};
  for (const [k, v] of Object.entries(payload)) out[k] = (v !== null && typeof v === 'object') ? JSON.stringify(v) : v;
  return out;
};
const substitute = (template, vars = {}) => (template || '').replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));

/**
 * Dispatch a notification for one CIA domain_event. Returns a summary, or null when
 * the event is unmapped, no farmer recipient resolves, or the template is missing.
 * Templates are ensured by the relay once per run.
 */
const dispatchCiaNotification = async (event) => {
  const cfg = CIA_EVENT_NOTIFICATIONS[event.event_type];
  if (!cfg || !cfg.notifyFarmer) return null;
  const userId = await resolveFarmerUserId(event);
  if (!userId) return null;
  const { NotificationTemplate, NotificationV2, User } = getDb();
  const template = await NotificationTemplate.findOne({ where: { template_code: cfg.templateCode, is_active: true } });
  if (!template) return null;

  const vars = flatten(event.payload);
  const channels = (template.supported_channels || 'in_app').split(',').map((c) => c.trim());
  const notif = await NotificationV2.create({
    notification_uuid: crypto.randomUUID(),
    recipient_user_id: userId,
    template_id: template.id,
    notification_type: 'info',
    channels_used: channels.join(','),
    template_variables: vars,
    delivery_status: 'sent', // in-app delivery = the row exists
    sent_at: new Date(),
  });

  // Best-effort SMS through the platform gateway (a stub until a provider lands;
  // off unless FEATURE_SMS_NOTIFICATIONS). Never blocks the in-app delivery.
  if (channels.includes('sms') && config.features && config.features.smsNotifications) {
    const user = await User.findByPk(userId);
    if (user && user.mobile) {
      try { await sendSMS({ to: user.mobile, message: substitute(template.body_template, vars) }); }
      catch (e) { logger.warn(`ciaNotify: SMS failed for ${cfg.templateCode}: ${e.message}`); }
    }
  }

  return { notificationUuid: notif.notification_uuid, templateCode: cfg.templateCode, recipientUserId: userId };
};

module.exports = { dispatchCiaNotification, resolveFarmerUserId };
