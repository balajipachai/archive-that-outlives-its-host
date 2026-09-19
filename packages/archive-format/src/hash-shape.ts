/**
 * Pure shape check for a SHA-256 hex digest, with no crypto dependency, so
 * schema validation stays isomorphic (browser-safe). Actual hashing lives in
 * `./hash.ts` (Node-only) and `./hash-browser.ts` (Web Crypto).
 */
const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/

export function isValidSha256Hex(value: string): boolean {
  return SHA256_HEX_PATTERN.test(value)
}
