/**
 * Content hashing.
 *
 * Used to tie an evaluation record to the exact chart it was measured on, so a
 * later edit makes that record visibly stale. These are fast non-cryptographic
 * hashes; they identify content, they do not authenticate it.
 */

/** FNV-1a over 64 bits, emulated with two 32-bit lanes. Returns 16 hex chars. */
export function hashBytes(bytes: ArrayLike<number>): string {
  let h1 = 0x811c9dc5
  let h2 = 0x9e3779b1
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i] as number
    h1 = Math.imul(h1 ^ b, 0x01000193) >>> 0
    h2 = Math.imul(h2 ^ (b + i), 0x85ebca6b) >>> 0
    h2 = ((h2 << 13) | (h2 >>> 19)) >>> 0
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')
}

export function hashString(text: string): string {
  const bytes = new TextEncoder().encode(text)
  return hashBytes(bytes)
}

/**
 * Stable JSON stringify: object keys sorted, so that two structurally equal
 * configurations always hash the same regardless of construction order.
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']'
  if (ArrayBuffer.isView(value)) {
    return '[' + Array.from(value as unknown as ArrayLike<number>).join(',') + ']'
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return '{' + entries.map(([k, v]) => JSON.stringify(k) + ':' + stableStringify(v)).join(',') + '}'
}

export function hashObject(value: unknown): string {
  return hashString(stableStringify(value))
}
