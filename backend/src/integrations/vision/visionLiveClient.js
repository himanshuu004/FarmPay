/**
 * Live vision client — PLACEHOLDER. The muzzle-embedding model runs in the Python
 * ai-services (vision/), not yet wired here, so this fails loud rather than
 * returning a fake embedding. Implement against the ai-services endpoint when it
 * lands; the CIA muzzle service needs no change (it only depends on the seam).
 */
const notReady = () => {
  const e = new Error('vision.embedMuzzle not available — ai-services vision endpoint pending. Use VISION_MODE=mock for dev.');
  e.statusCode = 503; e.errorCode = 'VISION_NOT_READY';
  return e;
};
module.exports = { embedMuzzle: async () => { throw notReady(); } };
