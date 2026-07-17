/**
 * XLSX Parser Utility
 * Parses Excel workbooks from a multer memory buffer into row objects, matching
 * the output contract of `csvParser.parseCSV` so downstream code (bank portfolio
 * import pipeline) can be file-type agnostic.
 *
 * Used by the May 2026 bank pilot to ingest bank-supplied farmer loan workbooks.
 * A workbook may have multiple tabs — see `parseXlsxWorkbook` for multi-tab
 * support (Loans / Schedules / Payments tabs per the bulk-import plan).
 */

const XLSX = require('xlsx');

/**
 * Normalize a raw header string into a snake_case key matching csvParser's
 * convention: lowercase, non-alphanum → underscore, collapse repeats, strip
 * leading/trailing underscores.
 */
const normalizeHeader = (raw) =>
  String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');

/**
 * Converts Excel cell values to consistent string output. Excel dates become
 * ISO-8601 YYYY-MM-DD strings so they match what csvParser would produce and
 * downstream `parseFloat` / `new Date(...)` callers behave identically.
 */
const normalizeValue = (val) => {
  if (val === null || val === undefined) return null;
  if (val instanceof Date) {
    // YYYY-MM-DD — what Sequelize DATEONLY expects and what CSV users type
    const y = val.getUTCFullYear();
    const m = String(val.getUTCMonth() + 1).padStart(2, '0');
    const d = String(val.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof val === 'number') return String(val);
  if (typeof val === 'boolean') return val ? 'true' : 'false';
  return String(val).trim();
};

/**
 * Parse a single sheet from an already-loaded workbook into the same shape
 * as csvParser.parseCSV. Used by both parseXlsx and parseXlsxWorkbook.
 *
 * @param {XLSX.WorkBook} workbook
 * @param {string} sheetName
 * @param {Object} [options]
 * @param {boolean} [options.hasHeader=true]
 * @returns {{ headers: string[], rows: Object[], rowCount: number }}
 */
const parseSheet = (workbook, sheetName, options = {}) => {
  const { hasHeader = true } = options;
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return { headers: [], rows: [], rowCount: 0 };

  // Tell xlsx to preserve empty cells as null so columns always align
  // Use `raw: false` so dates are returned as JS Date objects (we then
  // normalize them in normalizeValue above)
  const aoa = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
    raw: false,
    dateNF: 'yyyy-mm-dd',
  });

  // Drop fully-empty rows (common at the end of Excel exports)
  const nonEmpty = aoa.filter(
    (row) => Array.isArray(row) && row.some((cell) => cell != null && String(cell).trim() !== '')
  );

  if (nonEmpty.length === 0) return { headers: [], rows: [], rowCount: 0 };

  let headers;
  let dataRows;

  if (hasHeader) {
    headers = nonEmpty[0].map((h) => normalizeHeader(h));
    dataRows = nonEmpty.slice(1);
  } else {
    headers = nonEmpty[0].map((_, i) => `col_${i}`);
    dataRows = nonEmpty;
  }

  const rows = dataRows.map((rowArr) => {
    const obj = {};
    headers.forEach((header, i) => {
      obj[header] = normalizeValue(rowArr[i]);
    });
    return obj;
  });

  return { headers, rows, rowCount: rows.length };
};

/**
 * Parse an xlsx file (from multer memory buffer) using the FIRST sheet.
 * Output shape matches csvParser.parseCSV exactly so callers can swap
 * parsers based on file extension without touching downstream logic.
 *
 * @param {Buffer} buffer
 * @param {Object} [options]
 * @returns {{ headers: string[], rows: Object[], rowCount: number }}
 */
const parseXlsx = (buffer, options = {}) => {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { headers: [], rows: [], rowCount: 0 };
  return parseSheet(workbook, sheetName, options);
};

/**
 * Parse a multi-tab xlsx workbook. Used by the bank-import pilot to ingest
 * a single workbook with three tabs (Loans / Schedules / Payments).
 *
 * @param {Buffer} buffer
 * @param {string[]} tabNames - Exact sheet names to extract
 * @returns {Object<string, { headers, rows, rowCount }>} keyed by the
 *   requested tab name. Missing tabs return empty parse results.
 */
const parseXlsxWorkbook = (buffer, tabNames) => {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const result = {};
  for (const name of tabNames) {
    // Case-insensitive sheet name match — banks capitalize inconsistently
    const actualName =
      workbook.SheetNames.find((s) => s.toLowerCase() === name.toLowerCase()) || name;
    result[name] = parseSheet(workbook, actualName);
  }
  return result;
};

/**
 * Detect whether a multer upload should be parsed as xlsx or csv.
 * Prefers mimetype, falls back to filename extension.
 */
const isXlsxFile = (file) => {
  if (!file) return false;
  const mt = (file.mimetype || '').toLowerCase();
  if (mt.includes('spreadsheetml') || mt.includes('ms-excel')) return true;
  const name = (file.originalname || '').toLowerCase();
  return name.endsWith('.xlsx') || name.endsWith('.xls');
};

module.exports = {
  parseXlsx,
  parseXlsxWorkbook,
  parseSheet,
  isXlsxFile,
  normalizeHeader,
  normalizeValue,
};
