/**
 * Language Middleware
 * Reads the X-Language header to determine the user's preferred language.
 * Falls back to 'en' (English) if not specified or unsupported.
 * Sets req.language for use in translation services.
 */

const config = require('../config');

const language = (req, res, next) => {
  const requestedLang = (req.headers['x-language'] || config.bhashini.defaultLang).toLowerCase().trim();

  // Validate against supported languages
  if (config.bhashini.supportedLangs.includes(requestedLang)) {
    req.language = requestedLang;
  } else {
    req.language = config.bhashini.defaultLang;
  }

  // Set response header so the client knows which language was used
  res.setHeader('X-Language', req.language);
  next();
};

module.exports = language;
