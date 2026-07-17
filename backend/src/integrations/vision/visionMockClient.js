/**
 * Mock vision client — a deterministic 8-dim muzzle embedding derived from the
 * animalKey (the ear tag by default). Same animal → same embedding (re-IDs); a
 * substitution (different animalKey) → a distant embedding. Quality is derived
 * from the photo ref so a specific "blurry" ref can be simulated.
 */
const crypto = require('crypto');

const embedMuzzle = async ({ photoRef, animalKey }) => {
  const key = String(animalKey || photoRef || '');
  const bytes = crypto.createHash('sha256').update('muzzle|' + key).digest();
  // Centre on zero ([-1,1]^8) so distinct animals are properly distant in cosine
  // space (all-positive vectors would always look similar); same key → identical.
  const embedding = Array.from({ length: 8 }, (_, i) => (bytes[i] / 255) * 2 - 1);
  const q = crypto.createHash('sha256').update('q|' + String(photoRef || '')).digest()[0] / 255;
  const quality = 0.7 + 0.3 * q; // 0.7–1.0
  return { embedding, quality: Math.round(quality * 10000) / 10000, dim: embedding.length };
};

module.exports = { embedMuzzle };
