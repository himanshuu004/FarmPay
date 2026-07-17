/**
 * CIA-1 — Slice D: DCS beneficiary selection (in-app, Convention 30).
 *   1. listInterested : own-DCS review queue with milk context
 *   2. recordSelection : reason/resolution mandatory; attribution; transitions; one-decision
 *   3. returnForCorrection : APPLICATION_PENDING → DOCUMENTS_INCOMPLETE (reason)
 */
process.env.INTEGRATION_MODE = process.env.INTEGRATION_MODE || 'mock';
const crypto = require('crypto');
const db = require('../src/shared/models');
const selection = require('../src/modules/cattle_induction/services/selectionService');
const { APP } = require('../src/modules/cattle_induction/constants/ciaStatus');

const uuid = () => crypto.randomUUID();
const boardReq = (claim, appUuid, body = {}) => ({ user: { id: claim, role: 'DCS_BOARD', dcsRef: 'SOC-RANCHI-014' }, params: { appUuid }, body, query: {} });

let boardClaim;

const mkApp = async (farmerRef, status = APP.PENDING_DCS_REVIEW) => {
  const row = await db.CiaApplication.create({
    application_uuid: uuid(), farmer_ref: farmerRef, dcs_ref: 'SOC-RANCHI-014', union_ref: 'UNI-RANCHI',
    scheme_version: 'CIA_UK_2026_v1', status, eoi_at: new Date(),
  });
  return row.application_uuid;
};

beforeAll(async () => {
  await db.sequelize.query('CREATE EXTENSION IF NOT EXISTS vector;');
  await db.sequelize.sync({ force: true });
  const board = await db.User.create({ user_id: 'U-' + uuid().slice(0, 8), mobile: '9333300000', first_name: 'Board' });
  boardClaim = board.user_id;
  // CiaApplication.farmer_ref has a FK to coop_memberships (society membership is
  // a precondition) — seed a membership for every farmer used below.
  for (const ref of ['F1001', 'F1002', 'F1003', 'F1004', 'F1005', 'F1006', 'F1007']) {
    await db.CoopMembership.create({ membership_uuid: uuid(), farmer_ref: ref, society_ref: 'SOC-RANCHI-014', union_ref: 'UNI-RANCHI', link_status: 'ERP_ONLY', joined_on: '2021-06-12' });
  }
});
afterAll(async () => { await db.sequelize.close(); });

describe('1. listInterested', () => {
  test('lists own-DCS applications awaiting review with milk context', async () => {
    await mkApp('F1001');
    const list = await selection.listInterested({ user: { id: boardClaim, role: 'DCS_BOARD', dcsRef: 'SOC-RANCHI-014' }, query: {} });
    expect(list.length).toBeGreaterThanOrEqual(1);
    const one = list.find((x) => x.farmerRef === 'F1001');
    expect(one.status).toBe(APP.PENDING_DCS_REVIEW);
    expect(one.milkAvgMonthlyValue).toBeGreaterThan(0);   // from ERP mock
  });
});

describe('2. recordSelection', () => {
  test('SELECTED requires a resolution document', async () => {
    const a = await mkApp('F1002');
    await expect(selection.recordSelection(boardReq(boardClaim, a, { decision: 'SELECTED' })))
      .rejects.toMatchObject({ errorCode: 'CIA_RESOLUTION_REQUIRED' });
  });

  test('NOT_SELECTED requires a reason', async () => {
    const a = await mkApp('F1003');
    await expect(selection.recordSelection(boardReq(boardClaim, a, { decision: 'NOT_SELECTED' })))
      .rejects.toMatchObject({ errorCode: 'CIA_REASON_REQUIRED' });
  });

  test('SELECTED → APPLICATION_PENDING, with board attribution + event', async () => {
    const a = await mkApp('F1004');
    const res = await selection.recordSelection(boardReq(boardClaim, a, { decision: 'SELECTED', resolutionDocRef: 's3://cia/minutes/1' }));
    expect(res.status).toBe(APP.APPLICATION_PENDING);

    const row = await db.CiaApplication.findOne({ where: { application_uuid: a } });
    const dec = await db.CiaSelectionDecision.findOne({ where: { application_id: row.id } });
    expect(dec.decision).toBe('SELECTED');
    expect(dec.decided_by_user_id).toBeTruthy();     // attribution
    const ev = await db.DomainEvent.findOne({ where: { event_type: 'cia.selection.recorded', aggregate_id: a } });
    expect(ev).toBeTruthy();
  });

  test('a second decision on the same application is refused (409)', async () => {
    const a = await mkApp('F1005');
    await selection.recordSelection(boardReq(boardClaim, a, { decision: 'SELECTED', resolutionDocRef: 's3://cia/minutes/2' }));
    // The application has already advanced past PENDING_DCS_REVIEW, so a re-decision
    // is refused with 409 (state guard fires before the redundant one-decision guard).
    await expect(selection.recordSelection(boardReq(boardClaim, a, { decision: 'SELECTED', resolutionDocRef: 's3://cia/minutes/2' })))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  test('NOT_SELECTED → APPLICATION_CLOSED with the reason recorded', async () => {
    const a = await mkApp('F1006');
    const res = await selection.recordSelection(boardReq(boardClaim, a, { decision: 'NOT_SELECTED', reason: 'Below minimum milk supply' }));
    expect(res.status).toBe(APP.APPLICATION_CLOSED);
    const row = await db.CiaApplication.findOne({ where: { application_uuid: a } });
    expect(row.reject_reason).toMatch(/minimum milk/i);
  });
});

describe('3. returnForCorrection', () => {
  test('APPLICATION_PENDING → DOCUMENTS_INCOMPLETE with a reason', async () => {
    const a = await mkApp('F1007', APP.APPLICATION_PENDING);
    const res = await selection.returnForCorrection(boardReq(boardClaim, a, { reason: 'Bank passbook photo unclear' }));
    expect(res.status).toBe(APP.DOCUMENTS_INCOMPLETE);
    const row = await db.CiaApplication.findOne({ where: { application_uuid: a } });
    expect(row.reject_reason).toMatch(/passbook/i);
  });
});
