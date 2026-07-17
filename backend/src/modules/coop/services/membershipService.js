/**
 * Membership service — links an app user to their Aanchal DCS membership.
 *
 * ERP pre-link: memberships arrive from the ERP (mock/filedrop) as ERP_ONLY
 * rows keyed by farmer_ref. When the member installs the app and verifies, we
 * flip the row to LINKED and attach user_id. Non-members get null → the app
 * shows the join-society nudge (the acquisition funnel).
 */
const crypto = require('crypto');
const { erp } = require('../../../integrations');

let db;
const getDb = () => { if (!db) db = require('../../../shared/models'); return db; };

/** Hydrate a membership row from the ERP master (used in mock mode / first touch). */
const ensureFromErp = async (farmerRef) => {
  const { CoopMembership } = getDb();
  const existing = await CoopMembership.findOne({ where: { farmer_ref: farmerRef } });
  if (existing) return existing;
  const master = await erp.getFarmerMaster(farmerRef);
  if (!master) return null;
  return CoopMembership.create({
    membership_uuid: crypto.randomUUID(),
    farmer_ref: master.farmerRef,
    society_ref: master.societyRef,
    union_ref: (master.society && master.society.unionRef) || null,
    member_name: master.name || null,
    mobile: master.mobile || null,
    joined_on: master.joinedOn || null,
    source_mode: erp.getMode(),
    synced_at: new Date(),
  });
};

/** Last-10-digits comparison so +91 / country-code variants match. */
const normalizeMobile = (m) => String(m || '').replace(/\D/g, '').slice(-10);

/**
 * Link an authenticated app user to an ERP membership by farmer_ref.
 *
 * SECURITY: the membership carries a member's milk passbook (financial PII) and
 * their 70%-of-dues input credit, so the link MUST prove the caller owns the
 * reference — otherwise anyone could claim another member's passbook and order
 * credit against their milk dues. We bind on the caller's OTP-verified mobile
 * matching the ERP master's registered mobile for that farmer_ref, and refuse to
 * re-point a membership already held by a different user.
 *
 * @param {number} userId       caller's internal User.id
 * @param {string} farmerRef     the DCS member reference being claimed
 * @param {object} opts          { callerMobile } — the caller's OTP-verified mobile
 */
const linkUser = async (userId, farmerRef, { callerMobile } = {}) => {
  const membership = (await ensureFromErp(farmerRef));
  if (!membership) {
    const e = new Error('No co-op membership found for that member reference');
    e.statusCode = 404; e.errorCode = 'COOP_MEMBER_NOT_FOUND';
    throw e;
  }

  // Already linked: idempotent for the same user, refused for anyone else.
  if (membership.user_id && membership.user_id !== userId) {
    const e = new Error('This membership is already linked to another account');
    e.statusCode = 409; e.errorCode = 'COOP_MEMBERSHIP_TAKEN';
    throw e;
  }
  if (membership.user_id === userId) return membership;

  // Ownership proof: caller's registered mobile must match the ERP master's.
  const memberMobile = normalizeMobile(membership.mobile);
  if (!memberMobile) {
    const e = new Error('This membership has no registered mobile on file — cannot verify ownership automatically');
    e.statusCode = 422; e.errorCode = 'COOP_LINK_UNVERIFIABLE';
    throw e;
  }
  if (memberMobile !== normalizeMobile(callerMobile)) {
    const e = new Error('Your mobile number does not match the one registered for this membership');
    e.statusCode = 403; e.errorCode = 'COOP_LINK_MOBILE_MISMATCH';
    throw e;
  }

  await membership.update({ user_id: userId, link_status: 'LINKED' });
  return membership;
};

const getByUser = async (userId) => {
  const { CoopMembership } = getDb();
  return getDb().CoopMembership.findOne({ where: { user_id: userId, is_active: true } });
};

const getByRef = async (farmerRef) => getDb().CoopMembership.findOne({ where: { farmer_ref: farmerRef } });

module.exports = { ensureFromErp, linkUser, getByUser, getByRef };
