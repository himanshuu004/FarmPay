/**
 * Dairy Controller
 * Handles HTTP requests for dairy herd, animal, health, and production endpoints.
 */

const dairyService = require('../services/dairyService');
const { success } = require('../../../shared/utils/responseHelper');
const { User } = require('../../../shared/models');

const resolveUserId = async (req) => {
  const user = await User.findOne({ where: { user_id: req.user.id, is_active: true } });
  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 404;
    err.errorCode = 'RES_001';
    throw err;
  }
  return user.id;
};

/** POST /roots/dairy/herd */
const createHerd = async (req, res, next) => {
  try {
    const farmerId = await resolveUserId(req);
    const result = await dairyService.createHerd(farmerId, req.body);
    return success(res, { message: 'Dairy herd created', data: result, statusCode: 201 });
  } catch (err) { next(err); }
};

/** POST /roots/dairy/herd/:herdId/animals */
const addAnimal = async (req, res, next) => {
  try {
    const result = await dairyService.addAnimal(parseInt(req.params.herdId, 10), req.body);
    return success(res, { message: 'Animal added to herd', data: result, statusCode: 201 });
  } catch (err) { next(err); }
};

/** POST /roots/dairy/animals/:animalId/health */
const addHealthRecord = async (req, res, next) => {
  try {
    const result = await dairyService.addHealthRecord(parseInt(req.params.animalId, 10), req.body);
    return success(res, { message: 'Health record created', data: result, statusCode: 201 });
  } catch (err) { next(err); }
};

/** GET /roots/dairy/herd/:herdId/production */
const getHerdProduction = async (req, res, next) => {
  try {
    const result = await dairyService.getHerdProduction(
      parseInt(req.params.herdId, 10),
      parseInt(req.query.month, 10),
      parseInt(req.query.year, 10)
    );
    return success(res, { message: 'Herd production summary retrieved', data: result });
  } catch (err) { next(err); }
};

module.exports = { createHerd, addAnimal, addHealthRecord, getHerdProduction };
