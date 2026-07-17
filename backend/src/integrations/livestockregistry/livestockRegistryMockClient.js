/**
 * Mock livestock-registry client — a 12-digit tag beginning "9999" is reported as
 * already registered on another loan (so the substitution/reuse fraud path is
 * testable with a valid tag); every other tag is unique.
 */
const lookupEarTag = async (tag) => {
  const onOtherLoan = String(tag || '').startsWith('9999');
  return { known: onOtherLoan, onOtherLoan };
};
module.exports = { lookupEarTag };
