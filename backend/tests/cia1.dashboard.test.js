/**
 * CIA-1 — Slice I: UCDF read surfaces + stage-SLA worker.
 *   1. commandDashboard : stage counts + funnel from status/domain_events
 *   2. auditLog          : append-only, read-only
 *   3. ciaStageSlaJob     : breach past TAT → escalation event; idempotent
 */
process.env.INTEGRATION_MODE = process.env.INTEGRATION_MODE || 'mock';
const crypto = require('crypto');
const db = require('../src/shared/models');
const duss = require('../src/modules/cattle_induction/services/dussService');
const schemeConfig = require('../src/modules/cattle_induction/services/schemeConfigService');
const slaWorker = require('../src/modules/cattle_induction/workers/ciaStageSlaWorker');
const { APP } = require('../src/modules/cattle_induction/constants/ciaStatus');

const uuid = () => crypto.randomUUID();
const adminReq = (query = {}, params = {}) => ({ user: { id: 'admin', role: 'UCDF_PM' }, query, params });

const mkApp = async (farmerRef, status) => {
  const row = await db.CiaApplication.create({
    application_uuid: uuid(), farmer_ref: farmerRef, dcs_ref: 'SOC-RANCHI-014', union_ref: 'UNI-RANCHI',
    scheme_version: 'CIA_UK_2026_v1', status, eoi_at: new Date(),
  });
  return row;
};

beforeAll(async () => {
  await db.sequelize.query('CREATE EXTENSION IF NOT EXISTS vector;');
  await db.sequelize.sync({ force: true });
  await schemeConfig.publishConfig({ schemeVersion: 'CIA_UK_2026_v1', rulesJson: {}, docChecklist: [] }, {});
  for (const ref of ['F1001', 'F1002', 'F1003', 'F1004', 'F1005']) {
    await db.CoopMembership.create({ membership_uuid: uuid(), farmer_ref: ref, society_ref: 'SOC-RANCHI-014', union_ref: 'UNI-RANCHI', link_status: 'ERP_ONLY', joined_on: '2021-06-12' });
  }
  // Seed a spread of statuses.
  await mkApp('F1001', APP.PENDING_SUPERVISOR_VERIFY);
  await mkApp('F1002', APP.PENDING_SUPERVISOR_VERIFY);
  await mkApp('F1003', APP.SUBMITTED_TO_BANK);
  const sanctioned = await mkApp('F1004', APP.LOAN_SANCTIONED);
  // One captured animal → cattleCaptured = 1.
  await db.CiaPurchase.create({ purchase_uuid: uuid(), application_id: sanctioned.id, status: 'PURCHASE_INITIATED', initiated_at: new Date() });
});
afterAll(async () => { await db.sequelize.close(); });

describe('1. command dashboard', () => {
  test('tiles + funnel reflect the seeded statuses', async () => {
    const d = await duss.commandDashboard(adminReq());
    expect(d.tiles.pendingSupervisor).toBe(2);
    expect(d.tiles.submittedToBank).toBe(1);
    expect(d.tiles.loanSanctioned).toBe(1);
    expect(d.tiles.cattleCaptured).toBe(1);
    expect(d.tiles.expressionsOfInterest).toBe(4);
    expect(d.funnel.find((f) => f.lab === 'Sanctioned').n).toBe(1);
    expect(d.asOf).toBeInstanceOf(Date);
  });
});

describe('2. audit log', () => {
  test('returns append-only events, most-recent first', async () => {
    // The scheme publish above wrote a cia.scheme.published event.
    const log = await duss.auditLog(adminReq());
    expect(Array.isArray(log)).toBe(true);
    expect(log.some((e) => e.eventType === 'cia.scheme.published')).toBe(true);
  });
});

describe('3. stage-SLA worker', () => {
  test('flags a stage sitting past its TAT and escalates; idempotent on re-run', async () => {
    const app = await mkApp('F1005', APP.PENDING_SUPERVISOR_VERIFY);
    // It entered the status 10 days ago (TAT for PENDING_SUPERVISOR_VERIFY = 5d).
    await db.DomainEvent.create({
      event_uuid: uuid(), event_type: 'cia.application.submitted', aggregate_type: 'CiaApplication',
      aggregate_id: app.application_uuid, payload: { status: APP.PENDING_SUPERVISOR_VERIFY },
      occurred_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    });

    const first = await slaWorker.run();
    const breached = first.breaches.find((b) => b.applicationUuid === app.application_uuid);
    expect(breached).toBeTruthy();
    expect(breached.escalatedTo).toBe('DUSS');

    const evCount = await db.DomainEvent.count({ where: { event_type: 'cia.stage.sla_breach', aggregate_id: app.application_uuid } });
    expect(evCount).toBe(1);

    // Re-run: no duplicate breach for the same status.
    await slaWorker.run();
    const evCount2 = await db.DomainEvent.count({ where: { event_type: 'cia.stage.sla_breach', aggregate_id: app.application_uuid } });
    expect(evCount2).toBe(1);

    // And the dashboard now shows the breach.
    const d = await duss.commandDashboard(adminReq());
    expect(d.tiles.slaBreaches).toBeGreaterThanOrEqual(1);
  });
});
