/**
 * Borrowing Source Service
 * Manages formal (banks, NBFCs, SFBs, PACS, FPOs, SHGs) and
 * informal (family, moneylender, adathiya, input seller) borrowing sources.
 * Data entered once, auto-pulled for loan applications.
 */

const { Op } = require('sequelize');
const { v4: uuidv4 } = require('uuid');
const logger = require('../../../shared/utils/logger');

let db;
const getDb = () => { if (!db) db = require('../../../shared/models'); return db; };

const FORMAL_TYPES = new Set([
  'public_sector_bank', 'private_bank', 'rrb', 'cooperative_bank',
  'sfb', 'nbfc', 'pacs', 'fpo', 'shg', 'mfi',
]);

/**
 * Add a new borrowing source for a farmer.
 */
const addBorrowingSource = async (farmerId, data, transaction = null) => {
  const { FarmerBorrowingSource } = getDb();

  const category = FORMAL_TYPES.has(data.sourceType) ? 'formal' : 'informal';

  const source = await FarmerBorrowingSource.create({
    borrowing_uuid: uuidv4(),
    farmer_id: farmerId,
    source_category: category,
    source_type: data.sourceType,
    source_name: data.sourceName || null,
    bank_account_id: data.bankAccountId || null,
    branch_name: data.branchName || null,
    pacs_code: data.pacsCode || null,
    member_id: data.memberId || null,
    group_name: data.groupName || null,
    loan_type: data.loanType || null,
    scheme_name: data.schemeName || null,
    sanction_amount: data.sanctionAmount || null,
    borrowed_amount: data.borrowedAmount || null,
    outstanding_amount: data.outstandingAmount || null,
    interest_rate_pct: data.interestRatePct || null,
    interest_period: data.interestPeriod || null,
    repayment_type: data.repaymentType || null,
    borrowed_date: data.borrowedDate || null,
    due_date: data.dueDate || null,
    lender_name: data.lenderName || null,
    lender_mobile: data.lenderMobile || null,
    collateral_type: data.collateralType || null,
    gold_weight_grams: data.goldWeightGrams || null,
    gold_purity_carat: data.goldPurityCarat || null,
    repayment_status: data.repaymentStatus || 'active',
    last_updated_by_farmer: new Date(),
  }, { transaction });

  return source;
};

/**
 * Update an existing borrowing source.
 */
const updateBorrowingSource = async (borrowingId, farmerId, data, transaction = null) => {
  const { FarmerBorrowingSource } = getDb();

  const source = await FarmerBorrowingSource.findOne({
    where: { id: borrowingId, farmer_id: farmerId, is_active: true },
  });

  if (!source) throw new Error('Borrowing source not found');

  const updateFields = {};
  const allowedFields = [
    'source_name', 'branch_name', 'pacs_code', 'member_id', 'group_name',
    'loan_type', 'scheme_name', 'sanction_amount', 'borrowed_amount',
    'outstanding_amount', 'interest_rate_pct', 'interest_period',
    'repayment_type', 'due_date', 'lender_name', 'lender_mobile',
    'collateral_type', 'gold_weight_grams', 'gold_purity_carat', 'repayment_status',
  ];

  for (const field of allowedFields) {
    const camelField = field.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    if (data[camelField] !== undefined) updateFields[field] = data[camelField];
  }

  updateFields.last_updated_by_farmer = new Date();
  await source.update(updateFields, { transaction });
  return source;
};

/**
 * Soft-delete a borrowing source.
 */
const removeBorrowingSource = async (borrowingId, farmerId) => {
  const { FarmerBorrowingSource } = getDb();
  const source = await FarmerBorrowingSource.findOne({
    where: { id: borrowingId, farmer_id: farmerId, is_active: true },
  });
  if (!source) throw new Error('Borrowing source not found');
  await source.update({ is_active: false });
  return source;
};

/**
 * Get all borrowing sources for a farmer with summary.
 */
const getBorrowingSources = async (farmerId) => {
  const { FarmerBorrowingSource } = getDb();

  const sources = await FarmerBorrowingSource.findAll({
    where: { farmer_id: farmerId, is_active: true },
    order: [['source_category', 'ASC'], ['created_at', 'DESC']],
  });

  return sources;
};

/**
 * Get aggregated borrowing summary for a farmer.
 */
const getBorrowingSummary = async (farmerId) => {
  const sources = await getBorrowingSources(farmerId);

  let formalTotal = 0;
  let informalTotal = 0;
  let formalCount = 0;
  let informalCount = 0;

  for (const s of sources) {
    const amount = parseFloat(s.outstanding_amount) || 0;
    if (s.source_category === 'formal') {
      formalTotal += amount;
      formalCount++;
    } else {
      informalTotal += amount;
      informalCount++;
    }
  }

  return {
    formal: { count: formalCount, totalOutstanding: formalTotal },
    informal: { count: informalCount, totalOutstanding: informalTotal },
    total: { count: formalCount + informalCount, totalOutstanding: formalTotal + informalTotal },
    formalToInformalRatio: informalTotal > 0 ? formalTotal / informalTotal : null,
  };
};

/**
 * Get active bank accounts from formal borrowing sources.
 * Used for loan disbursement auto-fill.
 */
const getActiveBankAccounts = async (farmerId) => {
  const { FarmerBorrowingSource, FarmerBankAccount } = getDb();

  const bankSources = await FarmerBorrowingSource.findAll({
    where: {
      farmer_id: farmerId,
      source_category: 'formal',
      source_type: { [Op.in]: ['public_sector_bank', 'private_bank', 'rrb', 'cooperative_bank', 'sfb', 'nbfc'] },
      is_active: true,
    },
    include: [{ model: FarmerBankAccount, as: 'bankAccount' }],
  });

  return bankSources.filter(s => s.bankAccount).map(s => ({
    borrowingSourceId: s.id,
    bankAccountId: s.bank_account_id,
    bankName: s.source_name,
    branchName: s.branch_name,
    accountNumberMasked: s.bankAccount.account_number_masked,
    ifscCode: s.bankAccount.ifsc_code,
    loanType: s.loan_type,
    outstandingAmount: s.outstanding_amount,
  }));
};

/**
 * Compute debt-to-income signal for trust score integration.
 * High informal debt = negative signal. Multiple formal accounts = positive.
 */
const getDebtHealthSignal = async (farmerId) => {
  const summary = await getBorrowingSummary(farmerId);

  let adjustment = 0;
  const details = [];

  // Multiple formal relationships = positive (credit history)
  if (summary.formal.count >= 2) {
    adjustment += 10;
    details.push('Multiple formal lending relationships (+10)');
  }

  // High formal-to-informal ratio = positive
  if (summary.formalToInformalRatio !== null && summary.formalToInformalRatio > 3) {
    adjustment += 10;
    details.push('Formal debt >> informal debt (+10)');
  }

  // Heavy informal debt = negative
  if (summary.informal.totalOutstanding > 50000) {
    adjustment -= 15;
    details.push('High informal borrowing >50k (-15)');
  }

  // Overdue informal sources
  const { FarmerBorrowingSource } = getDb();
  const overdueCount = await FarmerBorrowingSource.count({
    where: { farmer_id: farmerId, repayment_status: 'overdue', is_active: true },
  });
  if (overdueCount > 0) {
    adjustment -= 10 * overdueCount;
    details.push(`${overdueCount} overdue source(s) (-${10 * overdueCount})`);
  }

  // Clamp to ±30
  adjustment = Math.max(-30, Math.min(30, adjustment));

  return {
    adjustment,
    signal: 'BORROWING_HEALTH',
    reason: details.join('; ') || 'No borrowing data',
    details: summary,
  };
};

module.exports = {
  addBorrowingSource,
  updateBorrowingSource,
  removeBorrowingSource,
  getBorrowingSources,
  getBorrowingSummary,
  getActiveBankAccounts,
  getDebtHealthSignal,
};
