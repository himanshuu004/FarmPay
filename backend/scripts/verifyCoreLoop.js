/**
 * Phase-0 core-loop proof: RECORD → PROVE on Postgres.
 *
 *   register a herd + animal  →  log a cost + a revenue  →  compute P&L
 *
 * This is the blueprint's Phase-0 headline exit criterion. Run against a
 * migrated DB:  node backend/scripts/verifyCoreLoop.js
 */
require('dotenv').config();
const db = require('../src/shared/models');

const uuid = () => require('crypto').randomUUID();
const firstEnum = (model, field) => model.rawAttributes[field].values[0];

(async () => {
  const t = await db.sequelize.transaction();
  try {
    // 1. A farmer (auth User + FarmerProfile).
    const user = await db.User.create({
      user_id: 'USR-' + uuid().slice(0, 8),
      mobile: '9000000001',
      first_name: 'Ramesh',
    }, { transaction: t });

    const farmer = await db.FarmerProfile.create({
      farmer_id: user.id,
      profile_uuid: uuid(),
    }, { transaction: t });

    // 2. RECORD — register a herd + an animal (the register is the credit file).
    const herd = await db.DairyHerdRegister.create({
      register_uuid: uuid(),
      farmer_id: farmer.farmer_id,
      register_name: 'Home Shed',
    }, { transaction: t });

    const animal = await db.DairyAnimal.create({
      animal_uuid: uuid(),
      herd_id: herd.id,
      tag_number: '360000012345',        // 12-digit NDDB-style tag
    }, { transaction: t });

    // 3. RECORD — log money: one cost (feed) + one revenue (milk sale).
    await db.DairyCostEvent.create({
      event_uuid: uuid(),
      farmer_id: farmer.farmer_id,
      event_date: '2026-07-01',
      category: firstEnum(db.DairyCostEvent, 'category'),
      amount: 1800.00,
    }, { transaction: t });

    await db.DairyRevenueEvent.create({
      event_uuid: uuid(),
      farmer_id: farmer.farmer_id,
      event_date: '2026-07-02',
      category: firstEnum(db.DairyRevenueEvent, 'category'),
      amount: 4460.00,
    }, { transaction: t });

    // 4. PROVE — compute P&L from the logged events.
    const cost = await db.DairyCostEvent.sum('amount', { where: { farmer_id: farmer.farmer_id }, transaction: t });
    const revenue = await db.DairyRevenueEvent.sum('amount', { where: { farmer_id: farmer.farmer_id }, transaction: t });
    const pnl = Number(revenue) - Number(cost);

    await t.commit();

    console.log('── Phase-0 core loop (Postgres) ─────────────');
    console.log('farmer id        :', farmer.farmer_id);
    console.log('herd / animal    :', herd.register_name, '/ tag', animal.tag_number);
    console.log('total revenue ₹  :', Number(revenue).toFixed(2));
    console.log('total cost ₹     :', Number(cost).toFixed(2));
    console.log('P&L ₹            :', pnl.toFixed(2));
    if (pnl !== 2660) throw new Error(`Unexpected P&L ${pnl} (expected 2660)`);
    console.log('✔ RECORD → PROVE verified on Postgres');
    process.exit(0);
  } catch (e) {
    await t.rollback();
    console.error('�’ core-loop FAILED:', e.message);
    process.exit(1);
  }
})();
