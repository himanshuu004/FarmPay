/**
 * CIA-1 — Slice C: application status tracker.
 *   1. timeline    : built from the append-only domain_events outbox, in order
 *   2. current      : status + plain-language next step
 *   3. ownership     : a farmer sees only their own application (IDOR)
 */
process.env.INTEGRATION_MODE = process.env.INTEGRATION_MODE || 'mock';
const crypto = require('crypto');
const db = require('../src/shared/models');
const schemeConfig = require('../src/modules/cattle_induction/services/schemeConfigService');
const app = require('../src/modules/cattle_induction/services/applicationService');
const { APP } = require('../src/modules/cattle_induction/constants/ciaStatus');

const uuid = () => crypto.randomUUID();
const SCHEME = 'CIA_UK_2026_v1';
const req = (userClaim, params = {}) => ({ user: { id: userClaim, role: 'FARMER' }, params, body: {}, query: {} });

let ownerClaim, otherClaim, appUuid;

const seedFarmer = async (farmerRef, mobile) => {
  const u = await db.User.create({ user_id: 'U-' + uuid().slice(0, 8), mobile, first_name: farmerRef });
  await db.CoopMembership.create({ membership_uuid: uuid(), farmer_ref: farmerRef, society_ref: 'SOC-RANCHI-014', user_id: u.id, link_status: 'LINKED', joined_on: '2021-06-12' });
  return u.user_id;
};

beforeAll(async () => {
  await db.sequelize.query('CREATE EXTENSION IF NOT EXISTS vector;');
  await db.sequelize.sync({ force: true });
  await schemeConfig.publishConfig({ schemeVersion: SCHEME, rulesJson: {}, docChecklist: [{ key: 'aadhaar', label: 'Aadhaar', required: 'MANDATORY' }] }, {});

  ownerClaim = await seedFarmer('F1001', '9000000001');
  otherClaim = await seedFarmer('F1002', '9000000002');

  // EOI creates the row + first event; then simulate a couple more transitions with events.
  const eoi = await app.expressInterest({ user: { id: ownerClaim, role: 'FARMER' }, body: { schemeVersion: SCHEME }, params: {}, query: {} });
  appUuid = eoi.applicationUuid;
  const row = await db.CiaApplication.findOne({ where: { application_uuid: appUuid } });
  await row.update({ status: APP.SELECTED_BY_DCS });
  await db.DomainEvent.create({ event_uuid: uuid(), event_type: 'cia.selection.recorded', aggregate_type: 'CiaApplication', aggregate_id: appUuid, payload: { status: APP.SELECTED_BY_DCS }, occurred_at: new Date() });
  await row.update({ status: APP.APPLICATION_PENDING });
});
afterAll(async () => { await db.sequelize.close(); });

describe('status tracker', () => {
  test('returns current status + plain-language next step', async () => {
    const s = await app.getStatus(req(ownerClaim, { appUuid }));
    expect(s.status).toBe(APP.APPLICATION_PENDING);
    expect(s.nextStep).toMatch(/upload the required documents/i);
    expect(s.asOf).toBeInstanceOf(Date);
  });

  test('timeline is derived from domain_events, in chronological order', async () => {
    const s = await app.getStatus(req(ownerClaim, { appUuid }));
    const types = s.timeline.map((t) => t.eventType);
    expect(types[0]).toBe('cia.application.eoi');           // from EOI
    expect(types).toContain('cia.selection.recorded');
    // ordered ascending by occurrence
    const times = s.timeline.map((t) => new Date(t.at).getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  test('a farmer cannot read another farmer\'s application', async () => {
    await expect(app.getStatus(req(otherClaim, { appUuid })))
      .rejects.toMatchObject({ errorCode: 'CIA_APP_FORBIDDEN', statusCode: 403 });
  });
});
