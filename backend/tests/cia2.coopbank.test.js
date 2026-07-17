/**
 * CIA-2 — Slice M: cooperative-bank adapter (coopbank).
 *   1. mock mode  : deterministic API responses; initiate needs a consent ref
 *   2. live mode   : fails loud (contract pending #2), never fakes a bank action
 *   3. bad mode     : explicit error
 */
const { coopbank } = require('../src/integrations');

afterEach(() => { delete process.env.COOPBANK_MODE; });

describe('1. mock mode', () => {
  beforeAll(() => { process.env.COOPBANK_MODE = 'mock'; });
  test('submit + schedule are deterministic', async () => {
    const s = await coopbank.submitSanctionPacket({ batchUuid: 'b1', bankRef: 'COOPBANK-RANCHI', applications: [{}, {}] });
    expect(s.accepted).toBe(true);
    expect(s.packetRef).toMatch(/^PKT-/);
    const sched = await coopbank.getEmiSchedule({ applicationUuid: 'a1' });
    expect(sched).toHaveLength(12);
  });
  test('initiateEmiDeduction requires a consent ref, then returns a deduction ref', async () => {
    await expect(coopbank.initiateEmiDeduction({ applicationUuid: 'a1', installmentNo: 1, amount: 2150 }))
      .rejects.toMatchObject({ errorCode: 'COOPBANK_CONSENT_REQUIRED' });
    const r = await coopbank.initiateEmiDeduction({ applicationUuid: 'a1', installmentNo: 1, amount: 2150, consentRef: 'CONSENT-1' });
    expect(r.accepted).toBe(true);
    expect(r.deductionRef).toMatch(/^DED-/);
  });
});

describe('2. live mode (contract pending)', () => {
  test('every method fails loud with COOPBANK_NOT_READY', async () => {
    process.env.COOPBANK_MODE = 'live';
    await expect(coopbank.initiateEmiDeduction({ applicationUuid: 'a1', installmentNo: 1, amount: 2150, consentRef: 'C' }))
      .rejects.toMatchObject({ errorCode: 'COOPBANK_NOT_READY', statusCode: 503 });
    await expect(coopbank.getSanctionStatus({ batchUuid: 'b1' }))
      .rejects.toMatchObject({ errorCode: 'COOPBANK_NOT_READY' });
  });
});

describe('3. invalid mode', () => {
  test('an unknown mode is an explicit error', async () => {
    process.env.COOPBANK_MODE = 'telepathy';
    await expect(coopbank.getEmiSchedule({ applicationUuid: 'a1' }))
      .rejects.toMatchObject({ errorCode: 'COOPBANK_MODE_INVALID' });
  });
});
