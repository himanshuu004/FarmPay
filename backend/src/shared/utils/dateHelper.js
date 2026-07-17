/**
 * Date Helper
 * Utilities for IST conversion and common date formatting.
 */

/** IST offset from UTC in milliseconds (+5:30) */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/**
 * Converts a Date to IST and returns an ISO-like string.
 * @param {Date} [date=new Date()] - Date to convert
 * @returns {string} ISO string in IST (e.g. "2025-01-15T14:30:00.000+05:30")
 */
const toIST = (date = new Date()) => {
  const istDate = new Date(date.getTime() + IST_OFFSET_MS);
  const iso = istDate.toISOString().replace('Z', '+05:30');
  return iso;
};

/**
 * Returns the current date-time in IST.
 * @returns {Date} Current IST date
 */
const nowIST = () => {
  return new Date(Date.now() + IST_OFFSET_MS);
};

/**
 * Formats a date as DD/MM/YYYY (common Indian format).
 * @param {Date} date
 * @returns {string} e.g. "15/01/2025"
 */
const formatDDMMYYYY = (date) => {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
};

/**
 * Formats a date as YYYY-MM-DD (SQL / ISO date).
 * @param {Date} date
 * @returns {string} e.g. "2025-01-15"
 */
const formatYYYYMMDD = (date) => {
  const d = new Date(date);
  return d.toISOString().split('T')[0];
};

/**
 * Adds minutes to a date and returns a new Date.
 * @param {Date} date - Base date
 * @param {number} minutes - Minutes to add
 * @returns {Date}
 */
const addMinutes = (date, minutes) => {
  return new Date(date.getTime() + minutes * 60 * 1000);
};

/**
 * Checks if a date is expired (in the past).
 * @param {Date} expiryDate
 * @returns {boolean}
 */
const isExpired = (expiryDate) => {
  return new Date() > new Date(expiryDate);
};

module.exports = {
  toIST,
  nowIST,
  formatDDMMYYYY,
  formatYYYYMMDD,
  addMinutes,
  isExpired,
};
