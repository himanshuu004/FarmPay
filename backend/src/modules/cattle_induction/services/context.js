/**
 * Actor resolution for CIA services. Controllers stay thin (HTTP only) and hand
 * the whole `req` to the service; the service resolves the acting identity here.
 *
 * Farmer actors carry a co-op membership (the CIA society-membership precondition
 * reuses the COOP `coop_memberships` link). Staff actors (DCS/DUSS/bank/UCDF/
 * supervisor) carry a role from the JWT and an app user id; their society/union
 * scope is threaded through when available (staff→DCS assignment is a documented
 * CIA-1 follow-up — until then reads are role-gated, not geo-scoped).
 */
let db;
const getDb = () => { if (!db) db = require('../../../shared/models'); return db; };
const membershipService = require('../../coop/services/membershipService');

/**
 * @returns {{ jwtId:string|number|null, appUserId:number|null, role:string|null,
 *   membership:object|null, farmerRef:string|null, dcsRef:string|null }}
 */
const resolveActor = async (req) => {
  const jwtId = req.user ? req.user.id : null;
  const role = req.user ? (req.user.role || null) : null;
  let user = null;
  let membership = null;
  if (jwtId != null) {
    const { User } = getDb();
    user = await User.findOne({ where: { user_id: jwtId, is_active: true } });
    if (user) membership = await membershipService.getByUser(user.id);
  }
  return {
    jwtId,
    appUserId: user ? user.id : null,
    role,
    membership,
    farmerRef: membership ? membership.farmer_ref : null,
    dcsRef: membership ? membership.society_ref : null,
  };
};

module.exports = { resolveActor };
