/**
 * Phase-2 P2-5 HTTP smoke test — the KCC API end to end over real HTTP:
 * calculator → apply → submit → bank sanction/disburse lifecycle, an LT drawdown
 * that lands an animal in the register, and the generated renewal/application
 * pack (the v1 banker interface).
 */
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const config = require('../src/config');
const db = require('../src/shared/models');
const app = require('../src/app');
const { seedKccReference } = require('../src/modules/kcc/services/kccSeed');
const origination = require('../src/modules/kcc/services/kccOriginationService');

const uuid = () => crypto.randomUUID();
const tokenFor = (userIdStr, role = 'FARMER') =>
  jwt.sign({ id: userIdStr, role }, config.jwt.accessSecret, { issuer: config.jwt.issuer, algorithm: 'HS256', expiresIn: '10m' });

let farmerToken, bankToken, strangerToken, facilityUuid;

beforeAll(async () => {
  await db.sequelize.sync({ force: true });
  await seedKccReference();
  const farmer = await db.User.create({ user_id: 'U-KCC-' + uuid().slice(0, 6), mobile: '9222200001', first_name: 'Applicant' });
  await db.FarmerProfile.create({ farmer_id: farmer.id, profile_uuid: uuid() });
  await db.CoopMembership.create({ membership_uuid: uuid(), farmer_ref: 'F-KCC', society_ref: 'SOC-A', user_id: farmer.id, link_status: 'LINKED' });
  farmerToken = tokenFor(farmer.user_id, 'FARMER');
  bankToken = tokenFor('U-BANK', 'BANKER');

  const stranger = await db.User.create({ user_id: 'U-STR-' + uuid().slice(0, 6), mobile: '9222200099', first_name: 'Stranger' });
  await db.FarmerProfile.create({ farmer_id: stranger.id, profile_uuid: uuid() });
  strangerToken = tokenFor(stranger.user_id, 'FARMER');
});
afterAll(async () => { await db.sequelize.close(); });

const auth = (t) => ({ Authorization: `Bearer ${t}` });

test('calculator reproduces the dairy illustration over HTTP', async () => {
  const res = await request(app).post('/api/v1/kcc/calculate').set(auth(farmerToken))
    .send({ activities: [{ code: 'DAIRY', units: 2 }] });
  expect(res.status).toBe(200);
  expect(res.body.data.cmpl).toBe(29956);
});

test('apply drafts a facility with an LT sub-limit', async () => {
  const res = await request(app).post('/api/v1/kcc/apply').set(auth(farmerToken))
    .send({ activities: [{ code: 'DAIRY', units: 2 }], investmentItems: [{ item: 'ANIMAL', amount: 60000 }] });
  expect(res.status).toBe(201);
  expect(res.body.data.status).toBe('DRAFT');
  facilityUuid = res.body.data.facilityUuid;
});

test('farmer submits; a farmer cannot drive a bank transition', async () => {
  const submit = await request(app).post(`/api/v1/kcc/facility/${facilityUuid}/submit`).set(auth(farmerToken));
  expect(submit.status).toBe(200);
  expect(submit.body.data.status).toBe('SUBMITTED');

  // Farmer token is rejected by roleCheck('BANKER') on /transition.
  const forbidden = await request(app).post(`/api/v1/kcc/facility/${facilityUuid}/transition`).set(auth(farmerToken))
    .send({ toStatus: 'UNDER_REVIEW' });
  expect(forbidden.status).toBe(403);
});

test('bank walks the facility to SANCTIONED', async () => {
  // Society/Milk-Union certification (ERP-authored) must precede the bank.
  await origination.certify(facilityUuid, { membershipRef: 'F-KCC', tieup: true });
  for (const toStatus of ['UNDER_REVIEW', 'FORWARDED_TO_BANK', 'SANCTIONED']) {
    const res = await request(app).post(`/api/v1/kcc/facility/${facilityUuid}/transition`).set(auth(bankToken)).send({ toStatus });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe(toStatus);
  }
});

test('LT drawdown disburses an animal into the register', async () => {
  const create = await request(app).post(`/api/v1/kcc/facility/${facilityUuid}/drawdowns`).set(auth(farmerToken))
    .send({ item: 'ANIMAL', description: 'CB cow', amount: 60000 });
  expect(create.status).toBe(201);
  const requestUuid = create.body.data.requestUuid;

  await request(app).post(`/api/v1/kcc/drawdowns/${requestUuid}/submit`).set(auth(farmerToken)).expect(200);
  await request(app).post(`/api/v1/kcc/drawdowns/${requestUuid}/approve`).set(auth(bankToken)).expect(200);
  const disburse = await request(app).post(`/api/v1/kcc/drawdowns/${requestUuid}/disburse`).set(auth(bankToken));
  expect(disburse.status).toBe(200);
  expect(disburse.body.data.status).toBe('DISBURSED');
  expect(disburse.body.data.linkedAnimalId).toBeGreaterThan(0);
});

test('drawing-power snapshot and the renewal pack render', async () => {
  await request(app).post(`/api/v1/kcc/facility/${facilityUuid}/drawing-power`).set(auth(farmerToken))
    .send({ stocksValue: 10000, milkReceivables: 4000 }).expect(201);

  const pack = await request(app).get(`/api/v1/kcc/facility/${facilityUuid}/pack`).set(auth(farmerToken));
  expect(pack.status).toBe(200);
  expect(pack.body.data.facility.cmpl).toBe(89956);      // 29,956 ST MPL + 60,000 LT investment
  expect(pack.body.data.facility.stSubLimit).toBe(29956);
  expect(pack.body.data.ltDrawdowns.requests[0].status).toBe('DISBURSED');

  const html = await request(app).get(`/api/v1/kcc/facility/${facilityUuid}/pack.html`).set(auth(farmerToken));
  expect(html.status).toBe(200);
  expect(html.text).toContain('₹29,956');
  expect(html.text).toContain('Drawing power');
});

test('IDOR: another farmer cannot read or mutate the facility; a banker can read the pack', async () => {
  // Stranger (a different FARMER) is forbidden from the owner's facility.
  await request(app).get(`/api/v1/kcc/facility/${facilityUuid}/pack`).set(auth(strangerToken)).expect(403);
  await request(app).post(`/api/v1/kcc/facility/${facilityUuid}/submit`).set(auth(strangerToken)).expect(403);
  await request(app).post(`/api/v1/kcc/facility/${facilityUuid}/drawdowns`).set(auth(strangerToken))
    .send({ item: 'SHED', description: 'x', amount: 1000 }).expect(403);
  await request(app).get(`/api/v1/kcc/facility/${facilityUuid}/drawdowns`).set(auth(strangerToken)).expect(403);

  // The banker interface: a BANKER may read any facility's pack.
  await request(app).get(`/api/v1/kcc/facility/${facilityUuid}/pack`).set(auth(bankToken)).expect(200);

  // Unknown facility → 404 (not a 403 leak).
  await request(app).get(`/api/v1/kcc/facility/${uuid()}/pack`).set(auth(farmerToken)).expect(404);
});
