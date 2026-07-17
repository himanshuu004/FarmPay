/**
 * erpSyncJob — scans the ERP filedrop inbox and ingests each batch idempotently,
 * then archives processed files. Runs on a schedule in filedrop/webhook modes.
 *
 * Filename convention:  <KIND>_<YYYYMMDD>_<seq>.csv
 *   e.g. MEMBER_MASTER_20260705_001.csv, MILK_SUMMARY_20260705_001.csv
 *
 * Late / duplicate / out-of-order files are tolerated (see erpSyncService).
 */
const fs = require('fs');
const path = require('path');
const config = require('../config');
const logger = require('../shared/utils/logger');
const { ingestFile } = require('../modules/coop/services/erpSyncService');

const KIND_FROM_NAME = (name) => {
  const upper = name.toUpperCase();
  if (upper.startsWith('MEMBER_MASTER')) return 'MEMBER_MASTER';
  if (upper.startsWith('MILK_SUMMARY')) return 'MILK_SUMMARY';
  if (upper.startsWith('ORDER_STATUS')) return 'ORDER_STATUS';
  if (upper.startsWith('DISPATCH')) return 'DISPATCH';
  return null;
};

const runErpSyncJob = async () => {
  const inbox = config.erp.filedropInbox;
  const archive = config.erp.filedropArchive;
  if (!fs.existsSync(inbox)) {
    logger.info(`erpSyncJob: inbox ${inbox} does not exist; nothing to do`);
    return { processed: 0 };
  }
  fs.mkdirSync(archive, { recursive: true });

  const files = fs.readdirSync(inbox).filter((f) => /\.(csv|xlsx)$/i.test(f)).sort();
  let processed = 0;
  for (const file of files) {
    const kind = KIND_FROM_NAME(file);
    if (!kind) { logger.warn(`erpSyncJob: skipping unrecognised file ${file}`); continue; }
    const full = path.join(inbox, file);
    try {
      const res = await ingestFile({ fileName: file, kind, buffer: fs.readFileSync(full), mode: 'filedrop' });
      logger.info(`erpSyncJob: ${file} → ${res.status} (applied ${res.rowsApplied || 0})`);
      fs.renameSync(full, path.join(archive, file));
      processed += 1;
    } catch (err) {
      logger.error(`erpSyncJob: ${file} failed: ${err.message}`);
    }
  }
  return { processed };
};

module.exports = { runErpSyncJob };
