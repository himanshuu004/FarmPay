/**
 * ADVISORY controllers — HTTP only (house pattern). The dairy advisory feed:
 * generate-on-demand from the registers, list, and farmer disposal.
 */
const { success } = require('../../../shared/utils/responseHelper');
const advisoryEngine = require('../services/advisoryEngine');
const advisoryService = require('../services/advisoryService');

let db;
const getDb = () => { if (!db) db = require('../../../shared/models'); return db; };

const resolveUserId = async (req) => {
  const { User } = getDb();
  const user = await User.findOne({ where: { user_id: req.user.id, is_active: true } });
  if (!user) { const e = new Error('User not found'); e.statusCode = 404; e.errorCode = 'USER_NOT_FOUND'; throw e; }
  return user.id;
};

/** GET /advisory/feed — regenerate (cheap, deterministic) then list the open advisories. */
const feed = async (req, res, next) => {
  try {
    const farmerId = await resolveUserId(req);
    await advisoryEngine.generateForFarmer(farmerId).catch(() => null); // list still works if generation hiccups
    return success(res, { message: 'Advisory feed', data: await advisoryService.listForFarmer(farmerId, req.query) });
  } catch (err) { next(err); }
};

/** POST /advisory/generate — force a run, optionally with weather for heat-stress. */
const generate = async (req, res, next) => {
  try {
    const farmerId = await resolveUserId(req);
    const weather = (req.body.tempC != null && req.body.rhPct != null) ? { tempC: req.body.tempC, rhPct: req.body.rhPct } : null;
    const summary = await advisoryEngine.generateForFarmer(farmerId, { weather });
    return success(res, { message: 'Advisories generated', data: summary });
  } catch (err) { next(err); }
};

const markDone = async (req, res, next) => {
  try {
    const farmerId = await resolveUserId(req);
    return success(res, { message: 'Marked done', data: await advisoryService.markDone(req.params.itemUuid, farmerId) });
  } catch (err) { next(err); }
};

const dismiss = async (req, res, next) => {
  try {
    const farmerId = await resolveUserId(req);
    return success(res, { message: 'Dismissed', data: await advisoryService.dismiss(req.params.itemUuid, farmerId) });
  } catch (err) { next(err); }
};

module.exports = { feed, generate, markDone, dismiss };
