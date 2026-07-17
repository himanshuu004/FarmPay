/**
 * CIA Tier-3 (Fix 10A) — migration smoke test. `db:migrate` was previously
 * unverified. This asserts every migration file is well-formed (loads + exports
 * up()/down()) and that the new Tier-3 encryption-widen migration actually runs
 * (down then up) against the live schema via changeColumn.
 *
 * A full drop-and-replay of the whole chain is a separate infra task: it needs an
 * empty schema, but the test role can't recreate the pgvector extension after a
 * DROP SCHEMA (no superuser), and sequelize.drop() has a version bug here. Run the
 * full chain under sequelize-cli against a superuser-enabled DB.
 */
const fs = require('fs');
const path = require('path');
const db = require('../src/shared/models');

const qi = db.sequelize.getQueryInterface();
const Sequelize = db.Sequelize;
const MIG_DIR = path.resolve(__dirname, '../../migrations');
const files = fs.readdirSync(MIG_DIR).filter((f) => f.endsWith('.js')).sort();

beforeAll(async () => {
  await db.sequelize.query('CREATE EXTENSION IF NOT EXISTS vector;');
  await db.sequelize.sync({ force: true });
});
afterAll(async () => { await db.sequelize.close(); });

describe('migration files are well-formed', () => {
  test('every migration loads and exports up()/down()', () => {
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const m = require(path.join(MIG_DIR, f));
      expect(typeof m.up).toBe('function');
      expect(typeof m.down).toBe('function');
    }
  });
});

describe('the Tier-3 encryption-widen migration runs', () => {
  test('down() narrows then up() widens cia_sellers.bank_account against the live schema', async () => {
    const mig = require(path.join(MIG_DIR, '20260718000000-cia-encrypt-pii-widen.js'));
    // The model sync created bank_account at the widened 255.
    expect((await qi.describeTable('cia_sellers')).bank_account.type).toMatch(/255/);
    await mig.down(qi, Sequelize);
    expect((await qi.describeTable('cia_sellers')).bank_account.type).not.toMatch(/255/); // narrowed to 34
    await mig.up(qi, Sequelize);
    expect((await qi.describeTable('cia_sellers')).bank_account.type).toMatch(/255/);
  });
});
