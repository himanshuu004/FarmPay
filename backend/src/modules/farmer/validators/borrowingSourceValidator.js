/**
 * Borrowing Source Validators
 * Joi schemas for formal and informal borrowing source CRUD.
 */

const Joi = require('joi');

const FORMAL_SOURCE_TYPES = [
  'public_sector_bank', 'private_bank', 'rrb', 'cooperative_bank',
  'sfb', 'nbfc', 'pacs', 'fpo', 'shg', 'mfi',
];

const INFORMAL_SOURCE_TYPES = [
  'family_friends', 'money_lender', 'adathiya', 'input_seller_credit',
  'landlord', 'other',
];

const LOAN_TYPES = [
  'kcc_crop', 'kcc_allied', 'kcc_consumption',
  'crop_loan', 'dairy_loan', 'livestock_loan', 'fisheries_loan',
  'horticulture_loan', 'animal_husbandry', 'farm_mechanization',
  'irrigation', 'land_development', 'agri_processing',
  'warehouse_receipt', 'input_loan', 'agri_infrastructure',
  'agri_gold', 'kcc_gold', 'allied_gold', 'consumption_gold', 'gold_general',
  'jlg', 'shg_group_loan',
  'mudra_shishu', 'mudra_kishore', 'mudra_tarun',
  'personal', 'other',
];

const addBorrowingSourceSchema = Joi.object({
  sourceType: Joi.string().valid(...FORMAL_SOURCE_TYPES, ...INFORMAL_SOURCE_TYPES).required(),
  sourceName: Joi.string().max(150).allow(null, ''),
  // Bank/NBFC/SFB specific
  bankAccountId: Joi.number().integer().allow(null),
  branchName: Joi.string().max(100).allow(null, ''),
  // PACS/FPO/SHG specific
  pacsCode: Joi.string().max(30).allow(null, ''),
  memberId: Joi.string().max(50).allow(null, ''),
  groupName: Joi.string().max(100).allow(null, ''),
  // Loan details
  loanType: Joi.string().valid(...LOAN_TYPES).allow(null),
  schemeName: Joi.string().max(100).allow(null, ''),
  sanctionAmount: Joi.number().precision(2).min(0).allow(null),
  borrowedAmount: Joi.number().precision(2).min(0).allow(null),
  outstandingAmount: Joi.number().precision(2).min(0).allow(null),
  interestRatePct: Joi.number().precision(2).min(0).max(100).allow(null),
  interestPeriod: Joi.string().valid('monthly', 'yearly', 'flat', 'none').allow(null),
  repaymentType: Joi.string().valid('emi', 'bullet', 'flexi').allow(null),
  borrowedDate: Joi.date().iso().allow(null),
  dueDate: Joi.date().iso().allow(null),
  // Informal specific
  lenderName: Joi.string().max(100).allow(null, ''),
  lenderMobile: Joi.string().pattern(/^\+?[0-9]{10,13}$/).allow(null, ''),
  collateralType: Joi.string().valid('none', 'harvest_promise', 'gold', 'land', 'crop_standing', 'other').allow(null),
  // Gold specific
  goldWeightGrams: Joi.number().precision(2).min(0).allow(null),
  goldPurityCarat: Joi.string().valid('24k', '22k', '20k', '18k').allow(null),
  repaymentStatus: Joi.string().valid('active', 'partially_paid', 'fully_paid', 'overdue', 'restructured').default('active'),
});

const updateBorrowingSourceSchema = Joi.object({
  sourceName: Joi.string().max(150).allow(null, ''),
  branchName: Joi.string().max(100).allow(null, ''),
  outstandingAmount: Joi.number().precision(2).min(0).allow(null),
  interestRatePct: Joi.number().precision(2).min(0).max(100).allow(null),
  dueDate: Joi.date().iso().allow(null),
  repaymentStatus: Joi.string().valid('active', 'partially_paid', 'fully_paid', 'overdue', 'restructured'),
  loanType: Joi.string().valid(...LOAN_TYPES).allow(null),
  goldWeightGrams: Joi.number().precision(2).min(0).allow(null),
  goldPurityCarat: Joi.string().valid('24k', '22k', '20k', '18k').allow(null),
  collateralType: Joi.string().valid('none', 'harvest_promise', 'gold', 'land', 'crop_standing', 'other').allow(null),
}).min(1);

module.exports = {
  addBorrowingSourceSchema,
  updateBorrowingSourceSchema,
};
