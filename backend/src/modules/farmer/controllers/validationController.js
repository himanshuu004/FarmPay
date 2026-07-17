/**
 * Validation Controller
 * Exposes multi-level validation summary and gaps for a farmer.
 */

const validationService = require('../services/validationTrackingService');
const { success, error } = require('../../../shared/utils/responseHelper');

const getValidationSummary = async (req, res) => {
  try {
    const summary = await validationService.getValidationSummary(req.user.id);
    const overallConfidence = await validationService.computeCompositeConfidence(req.user.id);
    return success(res, 'Validation summary retrieved', { summary, overallConfidence });
  } catch (err) {
    return error(res, err.message, 500);
  }
};

const getValidationGaps = async (req, res) => {
  try {
    const gaps = await validationService.getValidationGaps(req.user.id);
    return success(res, 'Validation gaps retrieved', { gaps });
  } catch (err) {
    return error(res, err.message, 500);
  }
};

module.exports = { getValidationSummary, getValidationGaps };
