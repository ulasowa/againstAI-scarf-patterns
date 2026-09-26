/** Trigger a browser download and release the object URL afterwards. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  try {
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = fileName
    anchor.rel = 'noopener'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  } finally {
    // Give the navigation a tick before revoking, then free the memory.
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }
}

export function downloadText(text: string, fileName: string, mime: string): void {
  downloadBlob(new Blob([text], { type: `${mime};charset=utf-8` }), fileName)
}

/** File-name-safe version of a user-supplied title. */
export function safeFileName(title: string, extension: string): string {
  const base =
    title
      .trim()
      .replace(/[^\w\- ]+/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 60) || 'chart'
  return `${base}.${extension}`
}
