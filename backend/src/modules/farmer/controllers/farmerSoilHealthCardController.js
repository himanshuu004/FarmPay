/**
 * Farmer Soil Health Card Controller
 * Multipart photo upload + structured field capture during onboarding,
 * plus a "skip for now" endpoint and a "get my SHC" endpoint for the
 * later edit screen.
 */

const path = require('path');
const { v4: uuidv4 } = require('uuid');

const farmerSoilHealthCardService = require('../services/farmerSoilHealthCardService');
const s3Service = require('../../../shared/services/s3Service');
const config = require('../../../config');
const { success } = require('../../../shared/utils/responseHelper');
const STATUS_CODES = require('../../../shared/constants/statusCodes');
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

/**
 * Coerce a multipart form-data string field to a number, or undefined.
 */
const num = (v) => {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

/** POST /farmer/soil-health-card */
const upsert = async (req, res, next) => {
  try {
    const farmerId = await resolveUserId(req);

    const payload = {
      latitude: num(req.body.latitude),
      longitude: num(req.body.longitude),
      location_accuracy_m: num(req.body.locationAccuracyM),
      soil_type: req.body.soilType || undefined,
      ph: num(req.body.ph),
      ec: num(req.body.ec),
      organic_carbon: num(req.body.organicCarbon),
      nitrogen_n: num(req.body.nitrogenN),
      phosphorus_p: num(req.body.phosphorusP),
      potassium_k: num(req.body.potassiumK),
      sulphur_s: num(req.body.sulphurS),
      zinc_zn: num(req.body.zincZn),
      boron_b: num(req.body.boronB),
      iron_fe: num(req.body.ironFe),
      manganese_mn: num(req.body.manganeseMn),
      copper_cu: num(req.body.copperCu),
      card_issue_date: req.body.cardIssueDate || undefined,
      card_reference_no: req.body.cardReferenceNo || undefined,
    };

    // Optional photo upload (best-effort — skip on S3 failure so the
    // structured fields still land for manual-entry farmers).
    let hasPhoto = false;
    if (req.file && req.file.buffer && req.file.size > 0) {
      try {
        const ext = path.extname(req.file.originalname || '').toLowerCase() || '.jpg';
        const key = `soil-health-cards/${farmerId}/${uuidv4()}${ext}`;
        const result = await s3Service.uploadFile({
          fileBuffer: req.file.buffer,
          key,
          contentType: req.file.mimetype || 'image/jpeg',
        });
        payload.photo_url = result.Location || key;
        payload.photo_captured_at = new Date();
        hasPhoto = true;
      } catch (e) {
        // Log + continue — Phase 1 must not block on S3 outages.
        req.log?.warn?.(`SHC photo upload failed: ${e.message}`);
      }
    }

    const hasManual = Object.entries(payload).some(([k, v]) =>
      v !== undefined && k !== 'latitude' && k !== 'longitude' && k !== 'location_accuracy_m'
        && k !== 'photo_url' && k !== 'photo_captured_at'
    );
    payload.source = hasPhoto && hasManual
      ? 'photo_plus_manual'
      : hasPhoto
        ? 'photo_only'
        : 'manual_entry';

    const row = await farmerSoilHealthCardService.upsertSoilHealthCard(farmerId, payload);
    return success(res, {
      message: 'Soil health card saved',
      data: { soilHealthCard: row },
      statusCode: STATUS_CODES.CREATED,
    });
  } catch (err) {
    next(err);
  }
};

/** GET /farmer/soil-health-card/me */
const getMine = async (req, res, next) => {
  try {
    const farmerId = await resolveUserId(req);
    const row = await farmerSoilHealthCardService.getSoilHealthCard(farmerId);
    return success(res, {
      message: row ? 'Soil health card retrieved' : 'No soil health card on file',
      data: { soilHealthCard: row },
    });
  } catch (err) {
    next(err);
  }
};

/** POST /farmer/soil-health-card/skip */
const skip = async (req, res, next) => {
  try {
    const farmerId = await resolveUserId(req);
    const result = await farmerSoilHealthCardService.markSkipped(farmerId);
    return success(res, { message: 'Soil health card step skipped', data: result });
  } catch (err) {
    next(err);
  }
};

module.exports = { upsert, getMine, skip };
