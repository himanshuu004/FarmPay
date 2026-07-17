/**
 * Central Configuration
 * Aggregates all environment variables into a single config object.
 * Import this file instead of reading process.env directly.
 */

require('dotenv').config();

const config = {
  // Application
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,
  appName: process.env.APP_NAME || 'Allied KCC',
  appUrl: process.env.APP_URL || 'http://localhost:3000',
  apiPrefix: process.env.API_PREFIX || '/api/v1',

  // Aanchal ERP integration (the co-op wedge): mock | filedrop | webhook | live
  integrationMode: process.env.INTEGRATION_MODE || 'mock',
  erp: {
    filedropInbox: process.env.ERP_FILEDROP_INBOX || './data/erp/inbox',
    filedropOutbox: process.env.ERP_FILEDROP_OUTBOX || './data/erp/outbox',
    filedropArchive: process.env.ERP_FILEDROP_ARCHIVE || './data/erp/archive',
    liveBaseUrl: process.env.ERP_LIVE_BASE_URL || null,
    liveApiKey: process.env.ERP_LIVE_API_KEY || null,
    webhookSecret: process.env.ERP_WEBHOOK_SECRET || null,
  },

  // Database (PostgreSQL 16 + pgvector + PostGIS)
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    name: process.env.DB_NAME || 'allied_kcc_dev',
    user: process.env.DB_USER || 'allied_kcc',
    password: process.env.DB_PASSWORD || '',
    dialect: process.env.DB_DIALECT || 'postgres',
    pool: {
      max: parseInt(process.env.DB_POOL_MAX, 10) || 20,
      min: parseInt(process.env.DB_POOL_MIN, 10) || 5,
      acquire: parseInt(process.env.DB_POOL_ACQUIRE, 10) || 30000,
      idle: parseInt(process.env.DB_POOL_IDLE, 10) || 10000,
    },
    logging: process.env.DB_LOGGING === 'true',
    // Read replica (production only)
    readHost: process.env.DB_READ_HOST || null,
    readPort: parseInt(process.env.DB_READ_PORT, 10) || 5432,
    readUser: process.env.DB_READ_USER || null,
    readPassword: process.env.DB_READ_PASSWORD || null,
  },

  // Redis
  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB, 10) || 0,
    keyPrefix: process.env.REDIS_KEY_PREFIX || 'akcc:',
  },

  // RabbitMQ
  rabbitmq: {
    url: process.env.RABBITMQ_URL || 'amqp://localhost:5672',
    exchange: process.env.RABBITMQ_EXCHANGE || 'farmerpay_exchange',
    prefetch: parseInt(process.env.RABBITMQ_PREFETCH, 10) || 10,
  },

  // JWT
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'change-me-access-secret',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'change-me-refresh-secret',
    accessExpiry: process.env.JWT_ACCESS_EXPIRY || '30m',
    refreshExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',
    issuer: process.env.JWT_ISSUER || 'farmerpay-platform',
  },

  // OTP
  otp: {
    length: parseInt(process.env.OTP_LENGTH, 10) || 6,
    expiryMinutes: parseInt(process.env.OTP_EXPIRY_MINUTES, 10) || 10,
    maxAttempts: parseInt(process.env.OTP_MAX_ATTEMPTS, 10) || 5,
    resendCooldownSeconds: parseInt(process.env.OTP_RESEND_COOLDOWN_SECONDS, 10) || 60,
  },

  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60000,
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
    authMax: parseInt(process.env.RATE_LIMIT_AUTH_MAX, 10) || 20,
    otpMax: parseInt(process.env.RATE_LIMIT_OTP_MAX, 10) || 5,
  },

  // AWS
  aws: {
    region: process.env.AWS_REGION || 'ap-south-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },

  // S3
  s3: {
    bucketName: process.env.S3_BUCKET_NAME || 'farmerpay-uploads',
    bucketRegion: process.env.S3_BUCKET_REGION || 'ap-south-1',
    presignedUrlExpiry: parseInt(process.env.S3_PRESIGNED_URL_EXPIRY, 10) || 3600,
    maxFileSize: parseInt(process.env.S3_MAX_FILE_SIZE, 10) || 10485760,
  },

  // KMS
  kms: {
    keyId: process.env.KMS_KEY_ID,
    region: process.env.KMS_REGION || 'ap-south-1',
  },

  // Email
  email: {
    provider: process.env.EMAIL_PROVIDER || 'ses',
    sesRegion: process.env.SES_REGION || 'ap-south-1',
    from: process.env.EMAIL_FROM || 'noreply@farmerpay.in',
    fromName: process.env.EMAIL_FROM_NAME || 'FarmerPay',
    smtp: {
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT, 10) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      user: process.env.SMTP_USER,
      password: process.env.SMTP_PASSWORD,
    },
  },

  // SMS
  sms: {
    provider: process.env.SMS_PROVIDER || 'twilio',
    apiKey: process.env.SMS_API_KEY,
    apiSecret: process.env.SMS_API_SECRET,
    senderId: process.env.SMS_SENDER_ID || 'FRMPAY',
  },

  // Bhashini (translation)
  bhashini: {
    apiUrl: process.env.BHASHINI_API_URL,
    userId: process.env.BHASHINI_USER_ID,
    apiKey: process.env.BHASHINI_API_KEY,
    defaultLang: process.env.BHASHINI_DEFAULT_LANG || 'en',
    supportedLangs: (process.env.BHASHINI_SUPPORTED_LANGS || 'en,hi').split(','),
  },

  // AI service
  ai: {
    serviceUrl: process.env.AI_SERVICE_URL,
    apiKey: process.env.AI_API_KEY,
  },

  // Weather
  weather: {
    apiUrl: process.env.WEATHER_API_URL,
    apiKey: process.env.WEATHER_API_KEY,
  },

  // Mandi (market prices)
  mandi: {
    apiUrl: process.env.MANDI_API_URL,
    apiKey: process.env.MANDI_API_KEY,
  },

  // Feature flags
  features: {
    bhashiniTranslation: process.env.FEATURE_BHASHINI_TRANSLATION === 'true',
    aiAdvisory: process.env.FEATURE_AI_ADVISORY === 'true',
    weatherAlerts: process.env.FEATURE_WEATHER_ALERTS === 'true',
    mandiPrices: process.env.FEATURE_MANDI_PRICES === 'true',
    smsNotifications: process.env.FEATURE_SMS_NOTIFICATIONS === 'true',
    emailNotifications: process.env.FEATURE_EMAIL_NOTIFICATIONS === 'true',
    pushNotifications: process.env.FEATURE_PUSH_NOTIFICATIONS === 'true',
    // PULSE Phase 3 — live ingestion + forecast model
    pulse: {
      // Default OFF — uses deterministic mock generator. Flip to true and set
      // PULSE_AGMARKNET_API_KEY to call the real data.gov.in Agmarknet API.
      agmarknetLive: process.env.PULSE_AGMARKNET_LIVE === 'true',
      agmarknetApiKey: process.env.PULSE_AGMARKNET_API_KEY || null,
      // Default ON — runs the SMA-SEASONAL-v1 model after every ingest.
      forecastEnabled: process.env.PULSE_FORECAST_ENABLED !== 'false',
      // Default ON — daily SENTINEL scan that emits market_risk EwsSignals.
      sentinelScanEnabled: process.env.PULSE_SENTINEL_SCAN_ENABLED !== 'false',
    },
  },

  // CORS
  cors: {
    allowedOrigins: (process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:3000').split(','),
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'debug',
    dir: process.env.LOG_DIR || 'logs',
    maxSize: process.env.LOG_MAX_SIZE || '20m',
    maxFiles: process.env.LOG_MAX_FILES || '14d',
  },
};

module.exports = config;
