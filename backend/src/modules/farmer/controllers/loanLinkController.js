/**
 * Loan Link Controller — field-agent onboarding for the May 2026 pilot (WS6.2)
 *
 * When a bank uploads its weekly Excel workbook, most farmers in the test
 * cohort won't have the FarmerPay app installed yet. The auto-match in
 * bankPortfolioBulkService (WS6.1) only catches farmers who already exist
 * in the `users` table. The rest need to be linked at field-agent
 * onboarding time: agent visits the village, walks the farmer through
 * MPIN signup, and then calls these two endpoints to claim any unlinked
 * bank loans that match the farmer's identity.
 *
 * Two-step flow so the farmer can see + confirm what she's claiming:
 *
 *   1. GET /farmer/link-loan-account/candidates
 *      body: { aadhaarLast4? }
 *      → returns unlinked bank_loan_accounts matching:
 *          borrower_mobile = user.mobile
 *          OR borrower_aadhaar_last4 = supplied aadhaarLast4
 *        with enough info for the farmer to recognize them
 *        (scheme, bank, sanction amount, district)
 *
 *   2. POST /farmer/link-loan-account/confirm
 *      body: { accountUuids: ["uuid-1", "uuid-2", ...] }
 *      → sets linked_farmer_id + linkage_status = 'manually_linked'
 *        on every selected row, all inside a single transaction
 *
 * Security: both routes sit behind the existing JWT `authenticate`
 * middleware in farmerRoutes.js. The farmer can ONLY link accounts
 * where `borrower_mobile === user.mobile` (exact match) or where an
 * explicitly-supplied aadhaarLast4 matches the row — we never let a
 * farmer claim an account on someone else's mobile by guessing UUIDs.
 */

const { Op } = require('sequelize');
const { success } = require('../../../shared/utils/responseHelper');
const logger = require('../../../shared/utils/logger');
const { User } = require('../../../shared/models');

let db;
const getDb = () => { if (!db) db = require('../../../shared/models'); return db; };

const resolveUser = async (req) => {
  const user = await User.findOne({ where: { user_id: req.user.id, is_active: true } });
  if (!user) { const err = new Error('User not found'); err.statusCode = 404; throw err; }
  return user;
};

/**
 * POST /farmer/link-loan-account/candidates
 * Returns bank loan accounts the farmer could potentially claim.
 */
const listCandidates = async (req, res, next) => {
  try {
    const user = await resolveUser(req);
    const { BankLoanAccount, BankPortfolioImport } = getDb();

    // Build the match criteria: mobile always, aadhaar-last-4 if supplied
    const aadhaarLast4 = req.body?.aadhaarLast4;
    const matchers = [];
    if (user.mobile) matchers.push({ borrower_mobile: user.mobile });
    if (aadhaarLast4 && /^\d{4}$/.test(String(aadhaarLast4))) {
      matchers.push({ borrower_aadhaar_last4: String(aadhaarLast4) });
    }
    if (matchers.length === 0) {
      return success(res, {
        message: 'No identity fields available for matching',
        data: { candidates: [], user: { mobile: user.mobile, hasAadhaarLast4: false } },
      });
    }

    const candidates = await BankLoanAccount.findAll({
      where: {
        linked_farmer_id: null,
        is_active: true,
        [Op.or]: matchers,
      },
      include: [{
        model: BankPortfolioImport,
        as: 'import',
        attributes: ['bank_name'],
        required: false,
      }],
      order: [['sanction_date', 'DESC']],
      limit: 20,
    });

    const wire = candidates.map((a) => ({
      accountUuid: a.account_uuid,
      finacleAccountNumber: a.finacle_account_number,
      borrowerName: a.borrower_name,
      bankName: a.import?.bank_name || null,
      schemeName: a.scheme_name,
      loanType: a.loan_type,
      sanctionAmount: a.sanction_amount,
      outstandingAmount: a.outstanding_amount,
      sanctionDate: a.sanction_date,
      district: a.district,
      // Show the matched reason so the farmer knows why she's seeing this row
      matchedBy: a.borrower_mobile === user.mobile
        ? 'mobile'
        : (a.borrower_aadhaar_last4 === aadhaarLast4 ? 'aadhaar_last4' : 'unknown'),
    }));

    return success(res, {
      message: `${wire.length} unlinked bank loan${wire.length === 1 ? '' : 's'} found`,
      data: {
        candidates: wire,
        user: { mobile: user.mobile, hasAadhaarLast4: !!aadhaarLast4 },
      },
    });
  } catch (err) { next(err); }
};

/**
 * POST /farmer/link-loan-account/confirm
 * Body: { accountUuids: string[] }
 * Claims one or more bank loan accounts for the authenticated farmer.
 */
const confirmLink = async (req, res, next) => {
  try {
    const user = await resolveUser(req);
    const { BankLoanAccount, sequelize } = getDb();
    const aadhaarLast4 = req.body?.aadhaarLast4;
    const uuids = Array.isArray(req.body?.accountUuids) ? req.body.accountUuids : [];
    if (uuids.length === 0) {
      const err = new Error('accountUuids is required (array of BankLoanAccount UUIDs)');
      err.statusCode = 400;
      throw err;
    }

    // Re-verify every UUID inside a transaction to prevent race-condition
    // double-linking. Only accept rows that are still unlinked AND match
    // by mobile OR by the supplied aadhaarLast4. Anything that fails
    // either check is left alone (not linked) and reported back.
    const result = await sequelize.transaction(async (t) => {
      const rows = await BankLoanAccount.findAll({
        where: { account_uuid: uuids, linked_farmer_id: null, is_active: true },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      const linked = [];
      const rejected = [];
      for (const row of rows) {
        const matchesMobile = row.borrower_mobile && row.borrower_mobile === user.mobile;
        const matchesAadhaar = aadhaarLast4 && row.borrower_aadhaar_last4 === String(aadhaarLast4);
        if (!matchesMobile && !matchesAadhaar) {
          rejected.push({ accountUuid: row.account_uuid, reason: 'identity_mismatch' });
          continue;
        }
        await row.update({
          linked_farmer_id: user.id,
          linkage_status: 'manually_linked',
          cohort_assigned_at: row.cohort_assigned_at || new Date(),
        }, { transaction: t });
        linked.push({
          accountUuid: row.account_uuid,
          schemeName: row.scheme_name,
          bankName: null, // filled below after commit
        });
      }

      // Any UUIDs the farmer sent that didn't come back from the initial
      // query are either already linked, inactive, or don't exist. Mark
      // them as rejected with reason=not_found so the client can show
      // something useful.
      const foundUuids = new Set(rows.map((r) => r.account_uuid));
      for (const u of uuids) {
        if (!foundUuids.has(u)) {
          rejected.push({ accountUuid: u, reason: 'not_found_or_already_linked' });
        }
      }

      return { linked, rejected };
    });

    logger.info(`Farmer ${user.id} linked ${result.linked.length} bank loans (${result.rejected.length} rejected)`);

    return success(res, {
      message: `Linked ${result.linked.length} bank loan${result.linked.length === 1 ? '' : 's'}`,
      data: {
        linkedCount: result.linked.length,
        rejectedCount: result.rejected.length,
        linked: result.linked,
        rejected: result.rejected,
      },
    });
  } catch (err) { next(err); }
};

module.exports = { listCandidates, confirmLink };
