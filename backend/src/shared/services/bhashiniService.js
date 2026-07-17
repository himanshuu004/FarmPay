/**
 * Bhashini Translation Service
 * Integrates with India's Bhashini ULCA API for multi-language translation.
 * Supports 11 Indian languages: en, hi, bn, te, mr, ta, gu, kn, ml, pa, or
 *
 * Flow:
 *   1. POST to ULCA model discovery → get pipeline service URL + model ID
 *   2. POST to pipeline service URL with text → get translated text
 *   3. Cache pipeline config in Redis for 24 hours
 */

const config = require('../../config');
const logger = require('../utils/logger');

let redis;
try {
  const Redis = require('ioredis');
  redis = new Redis({
    host: config.redis?.host || 'localhost',
    port: config.redis?.port || 6379,
    db: config.redis?.db || 0,
    lazyConnect: true,
  });
  redis.connect().catch(() => { redis = null; });
} catch { redis = null; }

const PIPELINE_CACHE_TTL = 86400; // 24 hours

/**
 * Supported language codes and their display names.
 */
const LANGUAGES = {
  en: 'English',
  hi: 'Hindi',
  bn: 'Bengali',
  te: 'Telugu',
  mr: 'Marathi',
  ta: 'Tamil',
  gu: 'Gujarati',
  kn: 'Kannada',
  ml: 'Malayalam',
  pa: 'Punjabi',
  or: 'Odia',
};

/**
 * Checks whether a language code is supported.
 */
const isSupported = (langCode) => {
  return config.bhashini.supportedLangs.includes(langCode);
};

/**
 * Discover translation pipeline from Bhashini ULCA API.
 * Returns { serviceUrl, modelId } for the given language pair.
 * Caches result in Redis for 24 hours.
 */
const getPipeline = async (sourceLang, targetLang) => {
  const cacheKey = `bhashini:pipeline:${sourceLang}:${targetLang}`;

  // Check cache first
  if (redis) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch (e) {
      logger.warn('Redis cache read failed for Bhashini pipeline', { error: e.message });
    }
  }

  // Call ULCA model discovery
  const apiUrl = config.bhashini.apiUrl || 'https://meity-auth.ulcacontrib.org';
  const userId = config.bhashini.userId;
  const apiKey = config.bhashini.apiKey;

  if (!userId || !apiKey) {
    logger.warn('Bhashini API credentials not configured (BHASHINI_USER_ID / BHASHINI_API_KEY)');
    return null;
  }

  const response = await fetch(`${apiUrl}/ulca/apis/v0/model/getModelsPipeline`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'ulcaApiKey': apiKey,
      'userID': userId,
    },
    body: JSON.stringify({
      pipelineTasks: [{
        taskType: 'translation',
        config: {
          language: {
            sourceLanguage: sourceLang,
            targetLanguage: targetLang,
          },
        },
      }],
      pipelineRequestConfig: {
        pipelineId: '64392f96daac500b55c543cd',
      },
    }),
  });

  if (!response.ok) {
    logger.error(`Bhashini pipeline discovery failed: ${response.status} ${response.statusText}`);
    return null;
  }

  const data = await response.json();

  // Extract service URL and model ID from response
  const pipelineConfig = data?.pipelineResponseConfig?.[0];
  const taskConfig = data?.pipelineInferenceAPIEndPoint;

  if (!taskConfig?.callbackUrl) {
    logger.error('Bhashini pipeline response missing callbackUrl');
    return null;
  }

  const pipeline = {
    serviceUrl: taskConfig.callbackUrl,
    inferenceApiKey: taskConfig.inferenceApiKey?.value || apiKey,
    modelId: pipelineConfig?.config?.[0]?.modelId || null,
  };

  // Cache in Redis
  if (redis) {
    try {
      await redis.setex(cacheKey, PIPELINE_CACHE_TTL, JSON.stringify(pipeline));
    } catch (e) {
      logger.warn('Redis cache write failed for Bhashini pipeline', { error: e.message });
    }
  }

  return pipeline;
};

/**
 * Translates text from one language to another using the Bhashini API.
 */
const translate = async ({ text, sourceLang, targetLang }) => {
  try {
    // Skip if feature is disabled
    if (!config.features.bhashiniTranslation) {
      return text;
    }

    // Skip if same language
    if (sourceLang === targetLang) return text;

    // Validate languages
    if (!isSupported(sourceLang) || !isSupported(targetLang)) {
      logger.warn(`Unsupported language pair: ${sourceLang} -> ${targetLang}`);
      return text;
    }

    // Get pipeline config (cached or fresh)
    const pipeline = await getPipeline(sourceLang, targetLang);
    if (!pipeline) {
      logger.warn('Bhashini pipeline not available, returning original text');
      return text;
    }

    // Call translation service
    const response = await fetch(pipeline.serviceUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': pipeline.inferenceApiKey,
      },
      body: JSON.stringify({
        pipelineTasks: [{
          taskType: 'translation',
          config: {
            language: {
              sourceLanguage: sourceLang,
              targetLanguage: targetLang,
            },
            serviceId: pipeline.modelId,
          },
        }],
        inputData: {
          input: [{ source: text }],
        },
      }),
    });

    if (!response.ok) {
      logger.error(`Bhashini translation API failed: ${response.status}`);
      return text;
    }

    const result = await response.json();
    const translated = result?.pipelineResponse?.[0]?.output?.[0]?.target;

    if (translated) {
      logger.info(`Bhashini translated ${sourceLang}->${targetLang}: "${text.substring(0, 30)}..." → "${translated.substring(0, 30)}..."`);
      return translated;
    }

    logger.warn('Bhashini returned empty translation, using original');
    return text;
  } catch (err) {
    logger.error(`Bhashini translation failed (${sourceLang}->${targetLang}):`, err.message);
    // Return original text on failure — translation should not block operations
    return text;
  }
};

/**
 * Translates text to multiple target languages in batch.
 */
const translateBatch = async (text, sourceLang, targetLangs) => {
  const results = {};
  const promises = targetLangs.map(async (lang) => {
    results[lang] = await translate({ text, sourceLang, targetLang: lang });
  });
  await Promise.all(promises);
  return results;
};

module.exports = {
  translate,
  translateBatch,
  isSupported,
  getPipeline,
  LANGUAGES,
};
