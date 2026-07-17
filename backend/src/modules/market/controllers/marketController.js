/**
 * MARKET controllers — HTTP only (house pattern). The v1 rate boards: milk
 * (fat/SNF, from the ERP chart) + feed (from the co-op catalog) + channel advisor.
 */
const { success } = require('../../../shared/utils/responseHelper');
const milkRateService = require('../services/milkRateService');
const feedPriceService = require('../services/feedPriceService');
const channelAdvisorService = require('../services/channelAdvisorService');

let db;
const getDb = () => { if (!db) db = require('../../../shared/models'); return db; };

const resolveUserId = async (req) => {
  const { User } = getDb();
  const user = await User.findOne({ where: { user_id: req.user.id, is_active: true } });
  if (!user) { const e = new Error('User not found'); e.statusCode = 404; e.errorCode = 'USER_NOT_FOUND'; throw e; }
  return user.id;
};

/** GET /market/milk-rates — the society board + the member's last realised rate. */
const milkRates = async (req, res, next) => {
  try {
    const farmerId = await resolveUserId(req);
    const chart = await milkRateService.getChart('DEFAULT');
    const realised = await milkRateService.realisedForFarmer(farmerId).catch(() => null);
    return success(res, {
      message: 'Milk rate board',
      data: {
        chart: chart ? { scope: chart.scope, method: chart.method, coefficients: chart.rules_json, currency: chart.currency, source: chart.source, effectiveFrom: chart.effective_from } : null,
        realised,
      },
    });
  } catch (err) { next(err); }
};

/** POST /market/milk-rates/estimate — payment for litres × fat/SNF. */
const estimate = async (req, res, next) => {
  try {
    return success(res, { message: 'Estimated payment', data: await milkRateService.estimate(req.body) });
  } catch (err) { next(err); }
};

/** GET /market/feed-prices — the feed catalog with MRP vs subsidised. */
const feedPrices = async (req, res, next) => {
  try {
    return success(res, { message: 'Feed prices', data: await feedPriceService.listFeed(req.query) });
  } catch (err) { next(err); }
};

/** GET /market/channel-advisor — where to sell this supply. */
const channelAdvisor = async (req, res, next) => {
  try {
    return success(res, { message: 'Channel advice', data: await channelAdvisorService.advise(req.query) });
  } catch (err) { next(err); }
};

module.exports = { milkRates, estimate, feedPrices, channelAdvisor };
