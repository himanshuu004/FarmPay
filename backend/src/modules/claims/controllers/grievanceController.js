/**
 * Grievance controllers — farmer files/lists their own; INSURER_OPS works the
 * disposal queue (ack/progress/resolve/escalate).
 */
const { success } = require('../../../shared/utils/responseHelper');
const grievanceService = require('../services/grievanceService');

let db;
const getDb = () => { if (!db) db = require('../../../shared/models'); return db; };

const resolveUserId = async (req) => {
  const { User } = getDb();
  const user = await User.findOne({ where: { user_id: req.user.id, is_active: true } });
  if (!user) { const e = new Error('User not found'); e.statusCode = 404; e.errorCode = 'USER_NOT_FOUND'; throw e; }
  return user.id;
};

const file = async (req, res, next) => {
  try {
    const farmerId = await resolveUserId(req);
    const ticket = await grievanceService.file({ farmerId, ...req.body });
    return success(res, { message: 'Grievance filed', data: { ticketUuid: ticket.ticket_uuid, status: ticket.status, disposalDueAt: ticket.disposal_due_at }, statusCode: 201 });
  } catch (err) { next(err); }
};

const listMine = async (req, res, next) => {
  try { const farmerId = await resolveUserId(req); return success(res, { message: 'My grievances', data: await grievanceService.listForFarmer(farmerId) }); }
  catch (err) { next(err); }
};

const transition = async (req, res, next) => {
  try {
    const t = await grievanceService.transition(req.params.ticketUuid, req.body.toStatus, { note: req.body.note });
    return success(res, { message: `Grievance → ${t.status}`, data: { ticketUuid: t.ticket_uuid, status: t.status } });
  } catch (err) { next(err); }
};

module.exports = { file, listMine, transition };
