/**
 * Phase-1 exit-criteria suite — THE WEDGE.
 *   1. 70% engine        : limit = 0.70 × outstanding − in-flight
 *   2. Demand windows     : submit gated to 1st/3rd week (deterministic dates)
 *   3. Order state machine: full window cycle draft→submit★→(ERP)→dispatch→receipt★
 *   4. App-never-approves  : ERP statuses rejected from the app path
 *   5. Auto-log            : receipt logs a dairy FEED cost (single entry, both systems)
 */
const crypto = require('crypto');
const db = require('../src/shared/models');
const policySvc = require('../src/modules/coop/services/coopPolicyService');
const elig = require('../src/modules/coop/services/eligibilityService');
const orders = require('../src/modules/coop/services/orderService');

const uuid = () => crypto.randomUUID();
const FARMER_REF = 'F5001';
let userId;

// Force the DEFAULT policy window to include OR exclude today, deterministically.
const today = new Date().getDate();
const openWindow = [{ label: 'OPEN', fromDay: 1, toDay: 31 }];
const closedWindow = [{ label: 'CLOSED', fromDay: today === 28 ? 1 : 28, toDay: today === 28 ? 2 : 28 }];
const setWindow = (windows) => db.CoopPolicy.update({ demand_windows: windows }, { where: { scope: 'DEFAULT' } });

beforeAll(async () => {
  await db.sequelize.sync({ force: true });
  await policySvc.ensureDefaultPolicy();

  const user = await db.User.create({ user_id: 'U-' + uuid().slice(0, 8), mobile: '9222200001', first_name: 'Wedge' });
  userId = user.id;
  await db.FarmerProfile.create({ farmer_id: user.id, profile_uuid: uuid() });
  await db.CoopMembership.create({ membership_uuid: uuid(), farmer_ref: FARMER_REF, society_ref: 'SOC-X', user_id: user.id, link_status: 'LINKED' });
  // One month of passbook with ₹5,000 outstanding payables.
  await db.CoopMilkSnapshot.create({ snapshot_uuid: uuid(), farmer_ref: FARMER_REF, society_ref: 'SOC-X', period: '2026-06', litres: 180, value: 6840, outstanding: 5000, as_of_date: '2026-07-04', source_mode: 'filedrop' });
  // Catalog.
  await db.CoopInputItem.create({ item_uuid: uuid(), sku: 'FEED-CATTLE-50', name: 'Cattle Feed 50kg', category: 'FEED', unit: 'bag', mrp: 1200, subsidised_price: 750 });
  await db.CoopInputItem.create({ item_uuid: uuid(), sku: 'MIN-MIX-1', name: 'Mineral Mix 1kg', category: 'MINERAL', unit: 'pack', mrp: 120, subsidised_price: 90 });
});
afterAll(async () => { await db.sequelize.close(); });

describe('1. 70% engine', () => {
  test('gross limit = 0.70 × outstanding; in-flight is deducted', async () => {
    const e = await elig.computeEligibility(FARMER_REF, 'SOC-X');
    expect(e.outstandingPayables).toBe(5000);
    expect(e.orderLimitFactor).toBe(0.70);
    expect(e.grossLimit).toBe(3500);      // 0.70 × 5000
    expect(e.inFlightOrders).toBe(0);
    expect(e.availableLimit).toBe(3500);
    expect(e.eligible).toBe(true);
  });

  test('order over the available limit cannot be submitted', async () => {
    const c = await elig.canSubmit(FARMER_REF, 4000, 'SOC-X');
    expect(c.ok).toBe(false);
    expect(c.reason).toMatch(/exceeds available limit/);
  });
});

describe('2. Demand windows', () => {
  test('open when day is inside a window, closed otherwise', async () => {
    const policy = await policySvc.getPolicy('DEFAULT');
    expect(policySvc.demandWindowStatus(policy, new Date(2026, 6, 3)).open).toBe(true);   // 3rd → week 1
    expect(policySvc.demandWindowStatus(policy, new Date(2026, 6, 18)).open).toBe(true);  // 18th → week 3
    expect(policySvc.demandWindowStatus(policy, new Date(2026, 6, 11)).open).toBe(false); // 11th → gap
  });

  test('submit is blocked when the window is closed', async () => {
    await setWindow(closedWindow);
    const order = await orders.createDraft({ farmerRef: FARMER_REF, societyRef: 'SOC-X', lines: [{ sku: 'FEED-CATTLE-50', quantity: 1 }] });
    await expect(orders.submitOrder(order.order_uuid)).rejects.toThrow(/demand window|closed/i);
  });
});

describe('3 & 5. Full window cycle + auto-log', () => {
  test('draft → submit★ → ERP approvals → dispatch → receipt★ → feed cost logged', async () => {
    await setWindow(openWindow);
    // 4 × ₹750 = ₹3,000  (≤ ₹3,500 available)
    const order = await orders.createDraft({ farmerRef: FARMER_REF, societyRef: 'SOC-X', lines: [{ sku: 'FEED-CATTLE-50', quantity: 4 }] });
    expect(order.status).toBe('DRAFT');
    expect(Number(order.total_amount)).toBe(3000);

    const submitted = await orders.submitOrder(order.order_uuid);
    expect(submitted.status).toBe('SUBMITTED');
    expect(Number(submitted.limit_snapshot)).toBe(3500);

    // in-flight now ₹3,000 → available drops to ₹500
    const afterSubmit = await elig.computeEligibility(FARMER_REF, 'SOC-X');
    expect(afterSubmit.inFlightOrders).toBe(3000);
    expect(afterSubmit.availableLimit).toBe(500);

    // ERP-authored approval chain (arrives via sync).
    for (const s of ['SECRETARY_APPROVED', 'SUPERVISOR_APPROVED', 'DUSS_PROCESSING', 'DISPATCHED']) {
      const o = await orders.applyErpStatus({ orderUuid: order.order_uuid, newStatus: s });
      expect(o.status).toBe(s);
    }

    const feedBefore = await db.DairyCostEvent.count({ where: { farmer_id: userId } });
    const done = await orders.confirmReceipt(order.order_uuid);
    expect(done.status).toBe('RECEIPT_CONFIRMED');

    // Auto-logged as a dairy FEED cost — single entry, both systems.
    const feedAfter = await db.DairyCostEvent.findAll({ where: { farmer_id: userId, category: 'FEED' } });
    expect(feedAfter.length).toBe(feedBefore + 1);
    expect(Number(feedAfter[feedAfter.length - 1].amount)).toBe(3000);

    // Order no longer in-flight → limit recovers to full gross.
    const afterReceipt = await elig.computeEligibility(FARMER_REF, 'SOC-X');
    expect(afterReceipt.inFlightOrders).toBe(0);
  });
});

describe('4. App never approves', () => {
  test('app path refuses to set an ERP-authored status', async () => {
    await setWindow(openWindow);
    const order = await orders.createDraft({ farmerRef: FARMER_REF, societyRef: 'SOC-X', lines: [{ sku: 'MIN-MIX-1', quantity: 1 }] });
    await expect(orders.applyErpStatus({ orderUuid: order.order_uuid, newStatus: 'RECEIPT_CONFIRMED' }))
      .rejects.toThrow(/not an ERP-authored status/);
  });

  test('illegal ERP transition is rejected', async () => {
    const order = await orders.createDraft({ farmerRef: FARMER_REF, societyRef: 'SOC-X', lines: [{ sku: 'MIN-MIX-1', quantity: 1 }] });
    // DRAFT → DISPATCHED is not a legal ERP step.
    await expect(orders.applyErpStatus({ orderUuid: order.order_uuid, newStatus: 'DISPATCHED' }))
      .rejects.toThrow(/Illegal ERP transition/);
  });
});
