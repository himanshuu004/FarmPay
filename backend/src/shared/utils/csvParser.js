/**
 * CSV Parser Utility
 * Parses CSV/Excel data from memory buffer (multer upload) into row objects.
 * Uses built-in string parsing — no external CSV library needed.
 */

/**
 * Parses a CSV buffer into an array of row objects.
 * @param {Buffer} buffer - File buffer from multer memory storage
 * @param {Object} [options]
 * @param {string} [options.delimiter=','] - Column delimiter
 * @param {boolean} [options.hasHeader=true] - First row is header
 * @returns {{ headers: string[], rows: Object[], rowCount: number }}
 */
const parseCSV = (buffer, options = {}) => {
  const { delimiter = ',', hasHeader = true } = options;
  const content = buffer.toString('utf-8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = content.split('\n').filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return { headers: [], rows: [], rowCount: 0 };
  }

  const parseLine = (line) => {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  let headers;
  let dataLines;

  if (hasHeader) {
    headers = parseLine(lines[0]).map((h) =>
      h.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
    );
    dataLines = lines.slice(1);
  } else {
    headers = parseLine(lines[0]).map((_, i) => `col_${i}`);
    dataLines = lines;
  }

  const rows = dataLines.map((line) => {
    const values = parseLine(line);
    const row = {};
    headers.forEach((header, i) => {
      row[header] = values[i] !== undefined ? values[i] : null;
    });
    return row;
  });

  return { headers, rows, rowCount: rows.length };
};

/**
 * Validates required columns exist in parsed CSV.
 * @param {string[]} headers - Parsed headers
 * @param {string[]} required - Required column names
 * @returns {{ valid: boolean, missing: string[] }}
 */
const validateColumns = (headers, required) => {
  const missing = required.filter((col) => !headers.includes(col));
  return { valid: missing.length === 0, missing };
};

module.exports = { parseCSV, validateColumns };
