// Force the test DB (database.js "test" env → allied_kcc_dev_test).
process.env.NODE_ENV = 'test';
process.env.DB_NAME = process.env.DB_NAME || 'allied_kcc_dev';
process.env.DB_PORT = process.env.DB_PORT || '5433';
process.env.DB_USER = process.env.DB_USER || 'allied_kcc';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'allied_kcc';
process.env.DB_LOGGING = 'false';
// 32-byte hex key for CIA at-rest field encryption (CiaSeller/CiaApplication/CiaDisbursement).
process.env.CIA_FIELD_ENCRYPTION_KEY = process.env.CIA_FIELD_ENCRYPTION_KEY || 'a'.repeat(64);
