/**
 * Maker-checker segregation of duties (PRD Part 9 principle; Convention baked
 * into the scaffold README). Route-level roleCheck ensures the actor HOLDS the
 * maker or checker role, but not that the checker is a DIFFERENT person than the
 * maker on the SAME item. This guard enforces that at the service layer.
 */

/**
 * @throws 403 CIA_SOD_VIOLATION when the checker is the same user who made the item.
 */
const assertDifferentActor = (makerUserId, checkerUserId) => {
  if (makerUserId != null && checkerUserId != null && String(makerUserId) === String(checkerUserId)) {
    const e = new Error('Maker and checker must be different users (segregation of duties)');
    e.statusCode = 403;
    e.errorCode = 'CIA_SOD_VIOLATION';
    throw e;
  }
  return true;
};

module.exports = { assertDifferentActor };
