/**
 * ERP filedrop ingest (blueprint §7.4 — the degraded launch mode).
 *
 * Daily CSV/XLSX batches (member master, milk summary + outstanding, …) are
 * ingested into the local ERP mirror. Idempotency is two-layered:
 *   1. FILE level  — a re-dropped identical file (same content_checksum) is
 *      recognised via the unique index on erp_sync_log and skipped.
 *   2. ROW level   — rows upsert by natural key, so a changed batch applies only
 *      the delta and never duplicates (sequence-/late-file tolerant).
 *
 * This is the Phase-0 exit criterion: filedrop reconciliation idempotency.
 */
const crypto = require('crypto');
const { parseCSV } = require('../../../shared/utils/csvParser');

let db;
const getDb = () => { if (!db) db = require('../../../shared/models'); return db; };

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/**
 * @param {object} args { fileName, kind: 'MEMBER_MASTER'|'MILK_SUMMARY', buffer:Buffer,
 *                        mode?:'filedrop'|'webhook'|'live', sequenceNo?:number, asOfDate?:string }
 */
const ingestFile = async ({ fileName, kind, buffer, mode = 'filedrop', sequenceNo = null, asOfDate = null }) => {
  const database = getDb();
  const { ErpSyncLog } = database;
  const checksum = sha256(buffer);

  // 1. FILE-level idempotency — identical re-drop is a no-op.
  const seen = await ErpSyncLog.findOne({ where: { content_checksum: checksum } });
  if (seen) {
    return { status: 'DUPLICATE_SKIPPED', syncId: seen.id, rowsApplied: 0, rowsSkipped: seen.rows_total };
  }

  const log = await ErpSyncLog.create({
    sync_uuid: crypto.randomUUID(),
    mode, file_name: fileName, file_kind: kind,
    content_checksum: checksum, sequence_no: sequenceNo,
    status: 'RECEIVED', received_at: new Date(),
  });

  const { rows } = parseCSV(buffer);
  let applied = 0, skipped = 0, failed = 0;

  // ORDER_STATUS / DISPATCH mirror ERP-authored order transitions. These run
  // per-row via the order lifecycle (each opens its own txn / emits events),
  // so they are NOT wrapped in a single ingest transaction.
  if (kind === 'ORDER_STATUS' || kind === 'DISPATCH') {
    const orderService = require('./orderService');
    for (const row of rows) {
      try {
        const newStatus = kind === 'DISPATCH' ? 'DISPATCHED' : String(row.status || '').toUpperCase();
        await orderService.applyErpStatus({
          orderUuid: row.order_uuid || null,
          erpOrderRef: row.erp_order_ref || null,
          newStatus,
          reason: row.reason || null,
        });
        applied += 1;
      } catch (rowErr) {
        failed += 1;
      }
    }
    await log.update({
      rows_total: rows.length, rows_applied: applied, rows_failed: failed,
      status: failed === 0 ? 'APPLIED' : 'PARTIAL', applied_at: new Date(),
    });
    return { status: log.status, syncId: log.id, rowsTotal: rows.length, rowsApplied: applied, rowsFailed: failed };
  }

  // KCC_CERTIFICATION — the DCS Secretary / Milk Union certifies a submitted KCC
  // (membership, cattle, milk supply, DBT, tie-up) from the Aanchal ERP. Drives
  // the facility SUBMITTED → SOCIETY_CERTIFIED and unlocks the ₹3L tie-up limit.
  if (kind === 'KCC_CERTIFICATION') {
    const origination = require('../../kcc/services/kccOriginationService');
    const truthy = (v) => v == null || String(v).toLowerCase() !== 'false';
    for (const row of rows) {
      try {
        await origination.certify(row.facility_uuid, {
          membershipRef: row.farmer_ref || null, milkUnionRef: row.union_ref || null,
          cattleCount: row.cattle_count != null ? Number(row.cattle_count) : null,
          milkSupply: truthy(row.milk_supply), dbt: truthy(row.dbt),
          bankAccountRef: row.bank_account || null, tieup: truthy(row.tieup),
          certifiedBy: row.certified_by || null, sourceMode: mode,
        });
        applied += 1;
      } catch (rowErr) { failed += 1; }
    }
    await log.update({
      rows_total: rows.length, rows_applied: applied, rows_failed: failed,
      status: failed === 0 ? 'APPLIED' : 'PARTIAL', applied_at: new Date(),
    });
    return { status: log.status, syncId: log.id, rowsTotal: rows.length, rowsApplied: applied, rowsFailed: failed };
  }

  const t = await database.sequelize.transaction();
  try {
    for (const row of rows) {
      try {
        if (kind === 'MEMBER_MASTER') await upsertMember(database, row, mode, t);
        else if (kind === 'MILK_SUMMARY') await upsertMilkSnapshot(database, row, mode, log.id, asOfDate, t);
        else throw new Error(`unknown file_kind ${kind}`);
        applied += 1;
      } catch (rowErr) {
        failed += 1;
      }
    }
    await log.update({
      rows_total: rows.length, rows_applied: applied, rows_skipped: skipped, rows_failed: failed,
      status: failed === 0 ? 'APPLIED' : 'PARTIAL', applied_at: new Date(),
    }, { transaction: t });
    await t.commit();
  } catch (err) {
    await t.rollback();
    await log.update({ status: 'FAILED', error_detail: { message: err.message } });
    throw err;
  }

  return { status: log.status, syncId: log.id, rowsTotal: rows.length, rowsApplied: applied, rowsFailed: failed };
};

// coop_memberships upsert by farmer_ref.
const upsertMember = async (database, row, mode, t) => {
  const { CoopMembership } = database;
  const farmerRef = row.farmer_ref || row.farmerRef;
  const [rec, created] = await CoopMembership.findOrCreate({
    where: { farmer_ref: farmerRef },
    defaults: {
      membership_uuid: crypto.randomUUID(),
      farmer_ref: farmerRef,
      society_ref: row.society_ref,
      union_ref: row.union_ref || null,
      member_name: row.member_name || null,
      mobile: row.mobile || null,
      joined_on: row.joined_on || null,
      source_mode: mode, synced_at: new Date(),
    },
    transaction: t,
  });
  if (!created) {
    await rec.update({
      society_ref: row.society_ref, union_ref: row.union_ref || rec.union_ref,
      member_name: row.member_name || rec.member_name, mobile: row.mobile || rec.mobile,
      source_mode: mode, synced_at: new Date(),
    }, { transaction: t });
  }
};

// coop_milk_snapshots upsert by (farmer_ref, period).
const upsertMilkSnapshot = async (database, row, mode, syncId, asOfDate, t) => {
  const { CoopMilkSnapshot } = database;
  const farmerRef = row.farmer_ref || row.farmerRef;
  const period = row.period;
  const [rec, created] = await CoopMilkSnapshot.findOrCreate({
    where: { farmer_ref: farmerRef, period },
    defaults: {
      snapshot_uuid: crypto.randomUUID(),
      farmer_ref: farmerRef, society_ref: row.society_ref || null, period,
      litres: row.litres || 0, value: row.value || 0,
      avg_fat_pct: row.avg_fat_pct || null,
      outstanding: row.outstanding || 0,
      as_of_date: asOfDate || row.as_of_date || period + '-01',
      source_mode: mode, source_sync_id: syncId,
    },
    transaction: t,
  });
  if (!created) {
    await rec.update({
      litres: row.litres || 0, value: row.value || 0,
      avg_fat_pct: row.avg_fat_pct || rec.avg_fat_pct,
      outstanding: row.outstanding || 0,
      as_of_date: asOfDate || row.as_of_date || rec.as_of_date,
      source_mode: mode, source_sync_id: syncId,
    }, { transaction: t });
  }
};

module.exports = { ingestFile, sha256 };
