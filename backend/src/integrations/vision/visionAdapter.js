/**
 * Vision Adapter — muzzle-embedding compute (the ai-services seam).
 *
 * The real embedding model runs in Python ai-services; this adapter is the seam
 * the CIA muzzle re-ID (shadow) calls. VISION_MODE:
 *   mock — deterministic embedding derived from an animalKey (so the SAME animal
 *          re-IDs, a substitution does not). Dev/demo. WIRED.
 *   live — the ai-services vision endpoint. Pending the service → notReady.
 *
 * @typedef {Object} VisionAdapter
 * @property {(args:{photoRef:string, animalKey?:string})=>Promise<{embedding:number[], quality:number, dim:number}>} embedMuzzle
 */
const VALID_MODES = ['mock', 'live'];
let impl;
const mode = () => process.env.VISION_MODE || 'mock';

const get = () => {
  if (impl && impl.__mode === mode()) return impl;
  const m = mode();
  if (!VALID_MODES.includes(m)) {
    const e = new Error(`Invalid VISION_MODE "${m}" (expected one of ${VALID_MODES.join('|')})`);
    e.statusCode = 500; e.errorCode = 'VISION_MODE_INVALID';
    throw e;
  }
  impl = m === 'mock' ? require('./visionMockClient') : require('./visionLiveClient');
  impl.__mode = m;
  return impl;
};

module.exports = {
  getMode: () => mode(),
  embedMuzzle: async (...a) => get().embedMuzzle(...a),
};
