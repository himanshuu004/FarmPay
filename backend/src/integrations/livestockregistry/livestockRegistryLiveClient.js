/**
 * Live livestock-registry client — PLACEHOLDER. The authoritative registry + API
 * is open-question #7. Until it lands this fails loud; the caller must treat a
 * lookup failure as "flag for post-verify", NOT as a wrongful rejection.
 */
const notReady = () => {
  const e = new Error('livestockRegistry.lookupEarTag not available — registry API pending (open-question #7). Use REGISTRY_MODE=mock, or fall back to internal DB uniqueness + flag.');
  e.statusCode = 503; e.errorCode = 'REGISTRY_NOT_READY';
  return e;
};
module.exports = { lookupEarTag: async () => { throw notReady(); } };
