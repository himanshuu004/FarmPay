/**
 * ERP mirror-backed client — serves reads from the local ERP mirror tables
 * (coop_milk_snapshots, coop_memberships, erp_sync_log, …) that the ingest
 * paths populate for filedrop / webhook / live modes.
 *
 * Stage F (Phase-0 must-haves) builds the ingest (erpSyncJob) and these reads.
 * Until then every method fails loud so a mis-set INTEGRATION_MODE can never
 * silently serve empty data as if the ERP had no records.
 */

const notReady = (method) => {
  const e = new Error(
    `ERP mirror not available yet: ${method}() is wired in Stage F. ` +
    `Use INTEGRATION_MODE=mock for local development until then.`
  );
  e.statusCode = 503;
  e.errorCode = 'ERP_MIRROR_NOT_READY';
  return e;
};

module.exports = {
  getMilkSummary: async () => { throw notReady('getMilkSummary'); },
  getOutstandingInputBalance: async () => { throw notReady('getOutstandingInputBalance'); },
  getFarmerMaster: async () => { throw notReady('getFarmerMaster'); },
  getSocietyMembers: async () => { throw notReady('getSocietyMembers'); },
  findByMobile: async () => { throw notReady('findByMobile'); },
};
