/** Identifier helpers. Uses crypto.randomUUID where available. */
export function newId(prefix = 'id'): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } }
  const uuid =
    g.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.floor(Math.random() * 0xffffffff).toString(36)}`
  return `${prefix}_${uuid}`
}

export function nowIso(): string {
  return new Date().toISOString()
}
