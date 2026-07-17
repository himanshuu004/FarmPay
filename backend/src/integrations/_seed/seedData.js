/**
 * Deterministic seed data shared by all mock adapters.
 *
 * Models the three-tier dairy cooperative hierarchy (Anand pattern):
 *
 *   Federation (state)  ──►  District Union  ──►  Society (village DCS)  ──►  Farmer
 *
 * Data flows up (farmer → society → union → federation); visibility flows down
 * (each tier can view the level below). `PROFILES` centralizes each farmer's
 * milk / loan / banking parameters so the ERP, Bank and AA mocks all agree.
 */

const FEDERATION = { federationRef: 'FED-AANCHAL', name: 'Aanchal Dairy Federation', state: 'Jharkhand' };

const UNIONS = [
  { unionRef: 'UNI-RANCHI', name: 'Ranchi District Milk Union', district: 'Ranchi', federationRef: 'FED-AANCHAL' },
  { unionRef: 'UNI-KHUNTI', name: 'Khunti District Milk Union', district: 'Khunti', federationRef: 'FED-AANCHAL' },
];

const SOCIETIES = [
  { societyRef: 'SOC-RANCHI-014', name: 'Kanke DCS', block: 'Kanke', district: 'Ranchi', unionRef: 'UNI-RANCHI' },
  { societyRef: 'SOC-RANCHI-031', name: 'Namkum DCS', block: 'Namkum', district: 'Ranchi', unionRef: 'UNI-RANCHI' },
  { societyRef: 'SOC-KHUNTI-007', name: 'Torpa DCS', block: 'Torpa', district: 'Khunti', unionRef: 'UNI-KHUNTI' },
  { societyRef: 'SOC-KHUNTI-012', name: 'Murhu DCS', block: 'Murhu', district: 'Khunti', unionRef: 'UNI-KHUNTI' },
];

const FARMERS = {
  F1001: { farmerRef: 'F1001', name: 'Ramesh Mahto', mobile: '9000000001', societyRef: 'SOC-RANCHI-014', joinedOn: '2021-06-12', bankAccount: { ifsc: 'SBIN0001234', accountLast4: '7781', bank: 'SBI' } },
  F1002: { farmerRef: 'F1002', name: 'Sunita Devi', mobile: '9000000002', societyRef: 'SOC-RANCHI-014', joinedOn: '2020-11-03', bankAccount: { ifsc: 'PUNB0019200', accountLast4: '4420', bank: 'PNB' } },
  F1003: { farmerRef: 'F1003', name: 'Imran Ansari', mobile: '9000000003', societyRef: 'SOC-RANCHI-031', joinedOn: '2023-09-21', bankAccount: { ifsc: 'HDFC0000456', accountLast4: '9911', bank: 'HDFC' } },
  F1004: { farmerRef: 'F1004', name: 'Geeta Kumari', mobile: '9000000004', societyRef: 'SOC-RANCHI-031', joinedOn: '2022-02-18', bankAccount: { ifsc: 'SBIN0001234', accountLast4: '3320', bank: 'SBI' } },
  F1005: { farmerRef: 'F1005', name: 'Mohan Oraon', mobile: '9000000005', societyRef: 'SOC-KHUNTI-007', joinedOn: '2023-01-09', bankAccount: { ifsc: 'BARB0KHUNTI', accountLast4: '7702', bank: 'BoB' } },
  F1006: { farmerRef: 'F1006', name: 'Phulmani Devi', mobile: '9000000006', societyRef: 'SOC-KHUNTI-007', joinedOn: '2019-08-25', bankAccount: { ifsc: 'SBIN0007788', accountLast4: '8810', bank: 'SBI' } },
  F1007: { farmerRef: 'F1007', name: 'Suresh Munda', mobile: '9000000007', societyRef: 'SOC-KHUNTI-012', joinedOn: '2022-12-01', bankAccount: { ifsc: 'CNRB0005566', accountLast4: '5566', bank: 'Canara' } },
};

/**
 * Per-farmer parameters consumed by the mock clients.
 *  milk    : { litres (monthly baseline), rate, consistency 0..1, trend (<1 = declining), outstanding }
 *  loans   : [{ loanRef, product, principal, emiAmount, tenureMonths, startDate, status, missed:[installmentNo] }]
 *  health  : AA financial-health snapshot
 */
const PROFILES = {
  F1001: {
    milk: { litres: 6.5 * 30, rate: 38, consistency: 0.97, trend: 1.0, outstanding: 5000 },
    loans: [{ loanRef: 'LN-7781-01', product: 'CATTLE_PURCHASE', principal: 120000, emiAmount: 5600, tenureMonths: 24, startDate: '2025-03-05', status: 'ACTIVE', missed: [] }],
    health: { avgMonthlyInflow: 24000, avgMonthlyOutflow: 19000, avgBalance: 14200, bouncedDebits: 0, healthScore: 82 },
  },
  F1002: {
    milk: { litres: 4.0 * 30, rate: 36, consistency: 0.74, trend: 0.70, outstanding: 1200 },
    loans: [{ loanRef: 'LN-4420-01', product: 'DAIRY_TERM', principal: 80000, emiAmount: 3850, tenureMonths: 24, startDate: '2025-01-10', status: 'ACTIVE', missed: [17] }],
    health: { avgMonthlyInflow: 16500, avgMonthlyOutflow: 15800, avgBalance: 3100, bouncedDebits: 1, healthScore: 58 },
  },
  F1003: {
    milk: { litres: 3.2 * 30, rate: 35, consistency: 0.61, trend: 0.90, outstanding: 9400 },
    loans: [{ loanRef: 'LN-9911-01', product: 'WORKING_CAPITAL', principal: 50000, emiAmount: 2450, tenureMonths: 24, startDate: '2025-10-15', status: 'ACTIVE', missed: [8] }],
    health: { avgMonthlyInflow: 13900, avgMonthlyOutflow: 13600, avgBalance: 1600, bouncedDebits: 2, healthScore: 47 },
  },
  F1004: {
    milk: { litres: 5.5 * 30, rate: 37, consistency: 0.88, trend: 0.95, outstanding: 2000 },
    loans: [{ loanRef: 'LN-3320-01', product: 'DAIRY_TERM', principal: 90000, emiAmount: 4200, tenureMonths: 24, startDate: '2025-04-12', status: 'ACTIVE', missed: [] }],
    health: { avgMonthlyInflow: 20500, avgMonthlyOutflow: 16800, avgBalance: 9000, bouncedDebits: 0, healthScore: 72 },
  },
  F1005: {
    milk: { litres: 3.0 * 30, rate: 35, consistency: 0.55, trend: 0.65, outstanding: 11000 },
    loans: [{ loanRef: 'LN-7702-01', product: 'CATTLE_PURCHASE', principal: 100000, emiAmount: 4800, tenureMonths: 24, startDate: '2025-05-09', status: 'ACTIVE', missed: [11, 12] }],
    health: { avgMonthlyInflow: 12800, avgMonthlyOutflow: 12900, avgBalance: 900, bouncedDebits: 3, healthScore: 38 },
  },
  F1006: {
    milk: { litres: 7.0 * 30, rate: 38, consistency: 0.95, trend: 1.0, outstanding: 1500 },
    loans: [],
    health: { avgMonthlyInflow: 26000, avgMonthlyOutflow: 19500, avgBalance: 16000, bouncedDebits: 0, healthScore: 85 },
  },
  F1007: {
    milk: { litres: 4.2 * 30, rate: 36, consistency: 0.70, trend: 0.85, outstanding: 4000 },
    loans: [{ loanRef: 'LN-5566-01', product: 'WORKING_CAPITAL', principal: 50000, emiAmount: 2450, tenureMonths: 24, startDate: '2025-09-15', status: 'ACTIVE', missed: [9] }],
    health: { avgMonthlyInflow: 15200, avgMonthlyOutflow: 14400, avgBalance: 3000, bouncedDebits: 1, healthScore: 55 },
  },
};

module.exports = { FEDERATION, UNIONS, SOCIETIES, FARMERS, PROFILES };
