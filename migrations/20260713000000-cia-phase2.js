'use strict';

/**
 * CIA-2 (Financial & ERP) migration — subsidy transfer + disbursement records.
 *
 * Follows the house contract: models are authoritative, so we sync() each in FK
 * dependency order (idempotent). EMI schedule/ledger tables land in the next
 * CIA-2 slices. No money is moved by these tables — they RECORD bank-authored
 * financial events for reconciliation (CIA credit != KCC != COOP, Convention 34).
 */
const CIA2_MODELS = [
  'CiaSubsidyTransfer',   // → application
  'CiaDisbursement',      // → application
  'CiaEmiSchedule',       // → application (installments; ingested idempotently)
  'CiaEmiLedger',         // → application (reconciled recovery per installment)
  'CiaEmiConsent',        // → application (tri-partite EMI-deduction authorisation)
];

module.exports = {
  async up() {
    const db = require('../backend/src/shared/models');
    for (const name of CIA2_MODELS) {
      if (db[name]) await db[name].sync();
    }
  },
  async down(queryInterface) {
    const db = require('../backend/src/shared/models');
    for (const name of [...CIA2_MODELS].reverse()) {
      if (db[name]) await queryInterface.dropTable(db[name].getTableName(), { cascade: true });
    }
  },
};
