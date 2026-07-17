module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/backend/tests'],
  testMatch: ['**/*.test.js'],
  setupFilesAfterEnv: ['<rootDir>/backend/tests/setup.js'],
  testTimeout: 30000,
  forceExit: true,
  // All suites share one Postgres test DB and each does sync({force}) in
  // beforeAll — run serially so parallel workers don't clobber each other.
  maxWorkers: 1,
};
