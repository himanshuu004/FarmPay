/**
 * Dairy Animal Photo Service
 * Handles manual photo uploads for animals. Resizes via sharp (max 1280px
 * long-edge, JPEG q=80) to keep storage + bandwidth cheap. NO AI / OCR /
 * vision calls — we explicitly avoid those to keep costs at zero.
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const sharp = require('sharp');
const logger = require('../../../shared/utils/logger');

let db;
const getDb = () => {
  if (!db) db = require('../../../shared/models');
  return db;
};

const UPLOAD_ROOT = path.join(process.cwd(), 'uploads', 'dairy-animal-photos');

const ensureDir = () => {
  if (!fs.existsSync(UPLOAD_ROOT)) {
    fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
  }
};

/**
 * Accepts a multer file object (buffer in memory), resizes, writes to disk,
 * and inserts a DairyAnimalPhoto row. Returns the saved row.
 */
const uploadPhoto = async (farmerId, animalUuid, file, meta = {}) => {
  const { DairyAnimal, DairyAnimalPhoto } = getDb();

  const animal = await DairyAnimal.findOne({
    where: { animal_uuid: animalUuid, farmer_id: farmerId, is_active: true },
  });
  if (!animal) {
    const err = new Error('Animal not found');
    err.statusCode = 404;
    err.errorCode = 'RES_001';
    throw err;
  }

  ensureDir();
  const photoUuid = uuidv4();
  const filename = `${photoUuid}.jpg`;
  const absPath = path.join(UPLOAD_ROOT, filename);

  const resized = await sharp(file.buffer)
    .rotate() // respect EXIF orientation
    .resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();

  const metadata = await sharp(resized).metadata();
  fs.writeFileSync(absPath, resized);

  const photo = await DairyAnimalPhoto.create({
    photo_uuid: photoUuid,
    animal_id: animalUuid,
    farmer_id: farmerId,
    photo_url: `/api/v1/roots/dairy/animals/${animalUuid}/photos/${photoUuid}`,
    photo_type: meta.photoType || 'PROFILE',
    caption: meta.caption || null,
    taken_at: meta.takenAt || new Date(),
    is_primary: !!meta.isPrimary,
    file_size_kb: Math.round(resized.length / 1024),
    width_px: metadata.width || null,
    height_px: metadata.height || null,
    uploaded_via: meta.uploadedVia || 'CAMERA',
  });

  // If this is marked primary, unset others and set animal.primary_photo_url
  if (meta.isPrimary) {
    await DairyAnimalPhoto.update(
      { is_primary: false },
      { where: { animal_id: animalUuid, photo_uuid: { $ne: photoUuid } } },
    ).catch(() => {}); // $ne fallback handled below
    // portable version without $ne
    const others = await DairyAnimalPhoto.findAll({
      where: { animal_id: animalUuid, is_primary: true },
    });
    for (const o of others) {
      if (o.photo_uuid !== photoUuid) await o.update({ is_primary: false });
    }
    await animal.update({ primary_photo_url: photo.photo_url });
  }

  logger.info(`Photo ${photoUuid} uploaded for animal ${animalUuid} (${photo.file_size_kb}KB)`);
  return photo;
};

const listPhotos = async (farmerId, animalUuid) => {
  const { DairyAnimalPhoto } = getDb();
  return DairyAnimalPhoto.findAll({
    where: { farmer_id: farmerId, animal_id: animalUuid, is_active: true },
    order: [['is_primary', 'DESC'], ['created_at', 'DESC']],
  });
};

/**
 * Streams the raw file bytes for an authenticated download.
 */
const getPhotoFilePath = async (farmerId, animalUuid, photoUuid) => {
  const { DairyAnimalPhoto } = getDb();
  const photo = await DairyAnimalPhoto.findOne({
    where: {
      photo_uuid: photoUuid,
      animal_id: animalUuid,
      farmer_id: farmerId,
      is_active: true,
    },
  });
  if (!photo) {
    const err = new Error('Photo not found');
    err.statusCode = 404;
    err.errorCode = 'RES_001';
    throw err;
  }
  return path.join(UPLOAD_ROOT, `${photoUuid}.jpg`);
};

module.exports = { uploadPhoto, listPhotos, getPhotoFilePath };
