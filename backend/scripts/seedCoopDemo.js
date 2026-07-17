/**
 * Seed a demo for the co-op wedge (dev DB). Idempotent.
 *   - DEFAULT coop_policy (70% + 1st/3rd-week windows)
 *   - input catalog
 *   - a demo app user linked to ERP member F1001, with passbook hydrated
 * Run: node backend/scripts/seedCoopDemo.js
 */
require('dotenv').config();
const crypto = require('crypto');
const db = require('../src/shared/models');
const policySvc = require('../src/modules/coop/services/coopPolicyService');
const membershipService = require('../src/modules/coop/services/membershipService');
const passbookService = require('../src/modules/coop/services/passbookService');

const uuid = () => crypto.randomUUID();

const CATALOG = [
  { sku: 'FEED-CATTLE-50', name: 'Cattle Feed 50kg', category: 'FEED', unit: 'bag', mrp: 1200, subsidised_price: 750 },
  { sku: 'MIN-MIX-1', name: 'Mineral Mix 1kg', category: 'MINERAL', unit: 'pack', mrp: 120, subsidised_price: 90 },
  { sku: 'FODDER-SEED-5', name: 'Fodder Seed 5kg', category: 'FODDER_SEED', unit: 'pack', mrp: 400, subsidised_price: 260 },
];

(async () => {
  await policySvc.ensureDefaultPolicy();

  for (const c of CATALOG) {
    await db.CoopInputItem.findOrCreate({ where: { sku: c.sku }, defaults: { item_uuid: uuid(), ...c } });
  }

  const [user] = await db.User.findOrCreate({
    where: { mobile: '9000000001' },
    defaults: { user_id: 'DEMO-F1001', mobile: '9000000001', first_name: 'Ramesh', last_name: 'Mahto' },
  });
  await db.FarmerProfile.findOrCreate({ where: { farmer_id: user.id }, defaults: { farmer_id: user.id, profile_uuid: uuid() } });

  const membership = await membershipService.linkUser(user.id, 'F1001'); // pulls from ERP mock
  await passbookService.hydrateFromErpIfEmpty('F1001');
  const pb = await passbookService.getPassbook('F1001', membership.society_ref);

  console.log('Seeded demo member:', user.user_id, '→ society', membership.society_ref);
  console.log('Passbook outstanding:', pb.outstandingPayables, '| 70% available:', pb.availableOrderLimit);
  console.log('Catalog items:', await db.CoopInputItem.count());
  await db.sequelize.close();
  process.exit(0); // Redis keeps the loop alive otherwise
})().catch((e) => { console.error('seed FAILED:', e.message); process.exit(1); });
