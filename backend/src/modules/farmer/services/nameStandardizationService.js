/**
 * Name Standardization Service
 * Transliterates, normalizes, and generates phonetic keys for farmer names.
 * Supports dedup via Soundex and Double Metaphone matching.
 */

const { Op } = require('sequelize');
const logger = require('../../../shared/utils/logger');
const { v4: uuidv4 } = require('uuid');

let db;
const getDb = () => { if (!db) db = require('../../../shared/models'); return db; };

/**
 * Soundex algorithm — generates a phonetic code for an English name.
 * Useful for catching spelling variations (Ramesh / Rameesh / Ramish).
 */
const soundex = (name) => {
  if (!name) return null;
  const s = name.toUpperCase().replace(/[^A-Z]/g, '');
  if (s.length === 0) return null;

  const map = {
    B: '1', F: '1', P: '1', V: '1',
    C: '2', G: '2', J: '2', K: '2', Q: '2', S: '2', X: '2', Z: '2',
    D: '3', T: '3',
    L: '4',
    M: '5', N: '5',
    R: '6',
  };

  let result = s[0];
  let lastCode = map[s[0]] || '0';

  for (let i = 1; i < s.length && result.length < 4; i++) {
    const code = map[s[i]] || '0';
    if (code !== '0' && code !== lastCode) {
      result += code;
    }
    lastCode = code;
  }

  return result.padEnd(4, '0');
};

/**
 * Simple Double Metaphone approximation for Indian names.
 * Handles common Indian phonetic patterns (Sh/S, Th/T, Ph/F, etc.).
 */
const doubleMetaphone = (name) => {
  if (!name) return null;
  let s = name.toUpperCase().replace(/[^A-Z]/g, '');
  if (s.length === 0) return null;

  // Indian-specific phonetic normalizations
  s = s.replace(/SH/g, 'S')
    .replace(/TH/g, 'T')
    .replace(/PH/g, 'F')
    .replace(/GH/g, 'G')
    .replace(/KH/g, 'K')
    .replace(/BH/g, 'B')
    .replace(/DH/g, 'D')
    .replace(/CH/g, 'C')
    .replace(/AA/g, 'A')
    .replace(/EE/g, 'I')
    .replace(/OO/g, 'U')
    .replace(/[AEIOU]/g, '');

  return s.substring(0, 8) || null;
};

/**
 * Standardize a raw name into English format.
 * @param {string} rawName - The name as entered by the farmer
 * @param {string} languageCode - ISO 639-1 code (hi, te, kn, etc.)
 * @returns {{ fullNameEn, firstName, middleName, lastName, vernacular }}
 */
const standardizeName = (rawName, languageCode = 'en') => {
  if (!rawName || typeof rawName !== 'string') {
    return { fullNameEn: null, firstName: null, middleName: null, lastName: null, vernacular: null };
  }

  const trimmed = rawName.trim();

  // Store vernacular if non-English
  const vernacular = languageCode !== 'en' ? trimmed : null;

  // For now, treat the input as English or transliterated
  // In production, integrate Bhashini API for transliteration
  const english = trimmed.replace(/\s+/g, ' ');
  const fullNameEn = english.toUpperCase();

  const parts = english.split(' ').filter(Boolean);
  const firstName = parts[0] || null;
  const lastName = parts.length > 1 ? parts[parts.length - 1] : null;
  const middleName = parts.length > 2 ? parts.slice(1, -1).join(' ') : null;

  return { fullNameEn, firstName, middleName, lastName, vernacular };
};

/**
 * Generate phonetic keys for a standardized English name.
 */
const generatePhoneticKeys = (nameEn) => {
  if (!nameEn) return { soundexKey: null, metaphoneKey: null };
  return {
    soundexKey: soundex(nameEn),
    metaphoneKey: doubleMetaphone(nameEn),
  };
};

/**
 * Create or update a FarmerNameRecord for a farmer.
 */
const upsertNameRecord = async (farmerId, rawName, languageCode = 'en', source = 'self_declared', transaction = null) => {
  const { FarmerNameRecord } = getDb();

  const { fullNameEn, firstName, middleName, lastName, vernacular } = standardizeName(rawName, languageCode);
  const { soundexKey, metaphoneKey } = generatePhoneticKeys(fullNameEn);

  const [record, created] = await FarmerNameRecord.findOrCreate({
    where: { farmer_id: farmerId, is_active: true },
    defaults: {
      name_uuid: uuidv4(),
      farmer_id: farmerId,
      full_name_en: fullNameEn,
      first_name_en: firstName || rawName.trim(),
      middle_name_en: middleName,
      last_name_en: lastName,
      full_name_vernacular: vernacular,
      vernacular_language_code: languageCode !== 'en' ? languageCode : null,
      phonetic_key_soundex: soundexKey,
      phonetic_key_metaphone: metaphoneKey,
      name_source: source,
      standardized_at: new Date(),
    },
    transaction,
  });

  if (!created) {
    await record.update({
      full_name_en: fullNameEn,
      first_name_en: firstName || rawName.trim(),
      middle_name_en: middleName,
      last_name_en: lastName,
      full_name_vernacular: vernacular || record.full_name_vernacular,
      vernacular_language_code: (languageCode !== 'en' ? languageCode : null) || record.vernacular_language_code,
      phonetic_key_soundex: soundexKey,
      phonetic_key_metaphone: metaphoneKey,
      name_source: source,
      standardized_at: new Date(),
    }, { transaction });
  }

  return record;
};

/**
 * Find potential duplicate names using phonetic matching within a district.
 * @param {string} nameEn - Standardized English name
 * @param {number} districtId - LGD district ID for geo-scoping
 * @param {number} excludeFarmerId - Farmer to exclude from results
 * @returns {Array} Matching FarmerNameRecords with farmer info
 */
const findPhoneticMatches = async (nameEn, districtId = null, excludeFarmerId = null) => {
  const { FarmerNameRecord, FarmerAddress, User } = getDb();
  const { soundexKey, metaphoneKey } = generatePhoneticKeys(nameEn);

  if (!soundexKey && !metaphoneKey) return [];

  const where = {
    is_active: true,
    [Op.or]: [],
  };

  if (soundexKey) where[Op.or].push({ phonetic_key_soundex: soundexKey });
  if (metaphoneKey) where[Op.or].push({ phonetic_key_metaphone: metaphoneKey });
  if (excludeFarmerId) where.farmer_id = { [Op.ne]: excludeFarmerId };

  const include = [{ model: User, as: 'user', attributes: ['id', 'mobile', 'first_name', 'last_name'] }];

  const matches = await FarmerNameRecord.findAll({ where, include, limit: 20 });

  // If district scoping requested, filter by farmer address
  if (districtId && matches.length > 0) {
    const farmerIds = matches.map(m => m.farmer_id);
    const addresses = await FarmerAddress.findAll({
      where: { farmer_id: { [Op.in]: farmerIds }, lgd_district_id: districtId, is_active: true },
      attributes: ['farmer_id'],
    });
    const sameDistrictFarmerIds = new Set(addresses.map(a => a.farmer_id));
    return matches.filter(m => sameDistrictFarmerIds.has(m.farmer_id));
  }

  return matches;
};

module.exports = {
  soundex,
  doubleMetaphone,
  standardizeName,
  generatePhoneticKeys,
  upsertNameRecord,
  findPhoneticMatches,
};
