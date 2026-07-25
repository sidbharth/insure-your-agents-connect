/**
 * Deterministic fake config-hash generator (plan §2, REQ-6.6).
 * Same seed string → same hash, across sessions and machines, so the demo's
 * numbers and fingerprints are perfectly repeatable. Not cryptographic —
 * everything here is simulated except the N price.
 */

/** FNV-1a 32-bit over a string. */
function fnv1a(input: string, seed = 0x811c9dc5): number {
  let h = seed >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** xorshift32 PRNG stepped from a numeric seed. */
function xorshift32(state: number): number {
  let x = state >>> 0 || 0x9e3779b9;
  x ^= x << 13;
  x >>>= 0;
  x ^= x >>> 17;
  x ^= x << 5;
  return x >>> 0;
}

/**
 * Deterministic 40-hex-char config hash, `0x…` prefixed, derived only from
 * the seed string (agent name + harness + manifest is the convention).
 */
export function configHash(seed: string): string {
  let hex = '';
  let state = fnv1a(seed);
  while (hex.length < 40) {
    state = xorshift32(state ^ fnv1a(seed + hex.length));
    hex += state.toString(16).padStart(8, '0');
  }
  return `0x${hex.slice(0, 40)}`;
}

/** "0x7f3a…c92e" — the shortened display form used across the mockups. */
export function shortHash(hash: string): string {
  if (hash.length <= 12) return hash;
  return `${hash.slice(0, 6)}…${hash.slice(-4)}`;
}
