/**
 * CIA-1 — foundations + Slice 0 (scheme/eligibility config) + Slice A (EOI).
 *   1. State machine    : guardTransition allows legal, rejects illegal
 *   2. Scheme config     : publish is versioned + immutable; latest wins
 *   3. Eligibility        : advisory only, never a sanction
 *   4. EOI ★             : membership precondition, idempotent, domain_event, state
 */
process.env.INTEGRATION_MODE = process.env.INTEGRATION_MODE || 'mock';
const crypto = require('crypto');
const db = require('../src/shared/models');
const { guardTransition, canTransition, APP } = require('../src/modules/cattle_induction/constants/ciaStatus');
const schemeConfig = require('../src/modules/cattle_induction/services/schemeConfigService');
const applicationService = require('../src/modules/cattle_induction/services/applicationService');

const uuid = () => crypto.randomUUID();
const FARMER_REF = 'F1001';        // exists in ERP mock (milk ~₹7k/mo, joined 2021)
const NON_MEMBER_REF = null;

// A fake Express req for a farmer actor (req.user.id = User.user_id claim).
const farmerReq = (userIdClaim, body = {}, query = {}) => ({ user: { id: userIdClaim, role: 'FARMER' }, body, query, params: {} });

let memberUserClaim;   // JWT id for the linked member
let strangerUserClaim; // JWT id for a user with NO membership

beforeAll(async () => {
  await db.sequelize.query('CREATE EXTENSION IF NOT EXISTS vector;');
  await db.sequelize.sync({ force: true });

  const member = await db.User.create({ user_id: 'U-' + uuid().slice(0, 8), mobile: '9000000001', first_name: 'Ramesh' });
  memberUserClaim = member.user_id;
  await db.CoopMembership.create({
    membership_uuid: uuid(), farmer_ref: FARMER_REF, society_ref: 'SOC-RANCHI-014', union_ref: 'UNI-RANCHI',
    user_id: member.id, link_status: 'LINKED', joined_on: '2021-06-12',
  });

  const stranger = await db.User.create({ user_id: 'U-' + uuid().slice(0, 8), mobile: '9111100000', first_name: 'NoMember' });
  strangerUserClaim = stranger.user_id;

  // Publish a scheme so EOI/eligibility have something to pin/read.
  await schemeConfig.publishConfig({
    schemeVersion: 'CIA_UK_2026_v1',
    title: 'Aanchal Cattle Induction 2026',
    rulesJson: { minMembershipMonths: 12, minAvgMonthlyMilkValue: 3000, maxCattle: 2, subsidyPct: 50 },
    docChecklist: [
      { key: 'aadhaar', label: 'Aadhaar', required: 'MANDATORY' },
      { key: 'bank_passbook', label: 'Bank passbook', required: 'MANDATORY' },
      { key: 'photo', label: 'Photograph', required: 'OPTIONAL' },
    ],
  }, { appUserId: 1 });
});
afterAll(async () => { await db.sequelize.close(); });

describe('1. CIA state machine', () => {
  test('allows a legal transition', () => {
    expect(canTransition('application', APP.INTEREST_SUBMITTED, APP.PENDING_DCS_REVIEW)).toBe(true);
    expect(() => guardTransition('application', APP.PENDING_DCS_REVIEW, APP.SELECTED_BY_DCS)).not.toThrow();
  });
  test('rejects an illegal transition with CIA_INVALID_TRANSITION', () => {
    expect(canTransition('application', APP.DRAFT, APP.LOAN_SANCTIONED)).toBe(false);
    try { guardTransition('application', APP.DRAFT, APP.LOAN_SANCTIONED); throw new Error('should have thrown'); }
    catch (e) { expect(e.errorCode).toBe('CIA_INVALID_TRANSITION'); expect(e.statusCode).toBe(409); }
  });
  test('the payment-gate status is never reachable from PURCHASE_INITIATED in one step', () => {
    expect(canTransition('purchase', 'PURCHASE_INITIATED', 'SELLER_PAYMENT_PENDING')).toBe(false);
  });
});

describe('2. Scheme config — versioned + immutable', () => {
  test('latest published version is served to new applicants', async () => {
    const s = await schemeConfig.getPublishedScheme();
    expect(s.schemeVersion).toBe('CIA_UK_2026_v1');
    expect(s.rules.subsidyPct).toBe(50);
    expect(s.documentChecklist.find((d) => d.key === 'aadhaar').required).toBe('MANDATORY');
  });
  test('re-publishing an already-published version is refused (immutable)', async () => {
    await expect(schemeConfig.publishConfig({ schemeVersion: 'CIA_UK_2026_v1', rulesJson: { subsidyPct: 90 } }, {}))
      .rejects.toMatchObject({ errorCode: 'CIA_SCHEME_LOCKED' });
  });
  test('a new version becomes the latest; the old one still exists (pinning intact)', async () => {
    await schemeConfig.publishConfig({ schemeVersion: 'CIA_UK_2026_v2', rulesJson: { subsidyPct: 60, minMembershipMonths: 12, minAvgMonthlyMilkValue: 3000 } }, {});
    const s = await schemeConfig.getPublishedScheme();
    expect(s.schemeVersion).toBe('CIA_UK_2026_v2');
    const old = await schemeConfig.getByVersion('CIA_UK_2026_v1');
    expect(old.is_published).toBe(true);
  });
});

describe('3. Eligibility (non-binding)', () => {
  test('a qualifying member is likely-eligible, flagged advisory', async () => {
    const r = await applicationService.checkEligibility(farmerReq(memberUserClaim));
    expect(r.isMember).toBe(true);
    expect(r.advisory).toBe(true);        // never a sanction
    expect(r.likelyEligible).toBe(true);
  });
  test('a non-member is guided to link membership, not sanctioned', async () => {
    const r = await applicationService.checkEligibility(farmerReq(strangerUserClaim));
    expect(r.isMember).toBe(false);
    expect(r.likelyEligible).toBeNull();
  });
});

describe('4. Express interest ★', () => {
  test('a non-member cannot express interest (membership precondition)', async () => {
    await expect(applicationService.expressInterest(farmerReq(strangerUserClaim, { schemeVersion: 'CIA_UK_2026_v2' })))
      .rejects.toMatchObject({ errorCode: 'CIA_MEMBERSHIP_REQUIRED', statusCode: 403 });
  });

  test('EOI creates a PENDING_DCS_REVIEW application, pins the scheme, and emits a domain event', async () => {
    const res = await applicationService.expressInterest(farmerReq(memberUserClaim, { schemeVersion: 'CIA_UK_2026_v2' }));
    expect(res.alreadyExists).toBe(false);
    expect(res.status).toBe(APP.PENDING_DCS_REVIEW);
    expect(res.schemeVersion).toBe('CIA_UK_2026_v2');
    expect(res.dcsRef).toBe('SOC-RANCHI-014');

    const row = await db.CiaApplication.findOne({ where: { application_uuid: res.applicationUuid } });
    expect(row.eoi_at).toBeTruthy();

    const ev = await db.DomainEvent.findOne({ where: { event_type: 'cia.application.eoi', aggregate_id: res.applicationUuid } });
    expect(ev).toBeTruthy();
    expect(ev.payload.status).toBe(APP.PENDING_DCS_REVIEW);
  });

  test('EOI is idempotent — a second call returns the same open application, no duplicate row', async () => {
    const again = await applicationService.expressInterest(farmerReq(memberUserClaim, { schemeVersion: 'CIA_UK_2026_v2' }));
    expect(again.alreadyExists).toBe(true);
    const count = await db.CiaApplication.count({ where: { farmer_ref: FARMER_REF, scheme_version: 'CIA_UK_2026_v2' } });
    expect(count).toBe(1);
  });

  test('EOI refuses an unpublished scheme version', async () => {
    await expect(applicationService.expressInterest(farmerReq(memberUserClaim, { schemeVersion: 'CIA_UK_2026_v9' })))
      .rejects.toMatchObject({ statusCode: 404 });   // unknown version
  });
});
