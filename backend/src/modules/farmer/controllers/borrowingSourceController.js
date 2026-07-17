/**
 * Borrowing Source Controller
 * Handles CRUD for formal and informal borrowing sources.
 */

const borrowingService = require('../services/borrowingSourceService');
const { success, error } = require('../../../shared/utils/responseHelper');

const getBorrowingSources = async (req, res) => {
  try {
    const sources = await borrowingService.getBorrowingSources(req.user.id);
    return success(res, 'Borrowing sources retrieved', { sources });
  } catch (err) {
    return error(res, err.message, 500);
  }
};

const getBorrowingSummary = async (req, res) => {
  try {
    const summary = await borrowingService.getBorrowingSummary(req.user.id);
    return success(res, 'Borrowing summary retrieved', { summary });
  } catch (err) {
    return error(res, err.message, 500);
  }
};

const addBorrowingSource = async (req, res) => {
  try {
    const source = await borrowingService.addBorrowingSource(req.user.id, req.body);
    return success(res, 'Borrowing source added', { source }, 201);
  } catch (err) {
    return error(res, err.message, 500);
  }
};

const updateBorrowingSource = async (req, res) => {
  try {
    const source = await borrowingService.updateBorrowingSource(
      parseInt(req.params.id), req.user.id, req.body
    );
    return success(res, 'Borrowing source updated', { source });
  } catch (err) {
    return error(res, err.message, err.message.includes('not found') ? 404 : 500);
  }
};

const removeBorrowingSource = async (req, res) => {
  try {
    await borrowingService.removeBorrowingSource(parseInt(req.params.id), req.user.id);
    return success(res, 'Borrowing source removed');
  } catch (err) {
    return error(res, err.message, err.message.includes('not found') ? 404 : 500);
  }
};

const getActiveBankAccounts = async (req, res) => {
  try {
    const accounts = await borrowingService.getActiveBankAccounts(req.user.id);
    return success(res, 'Active bank accounts retrieved', { accounts });
  } catch (err) {
    return error(res, err.message, 500);
  }
};

module.exports = {
  getBorrowingSources,
  getBorrowingSummary,
  addBorrowingSource,
  updateBorrowingSource,
  removeBorrowingSource,
  getActiveBankAccounts,
};
