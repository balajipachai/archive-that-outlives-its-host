/**
 * Small, dependency-free extension-to-MIME lookup covering the file types a
 * folio-scan archive realistically contains (images, scanned text, plain
 * metadata). Unknown extensions fall back to a safe, inert default so the
 * recovery reader never guesses its way into treating a download as
 * executable or renderable markup.
 */
const EXTENSION_TO_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.bmp': 'image/bmp',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.csv': 'text/csv',
  '.json': 'application/json',
  '.xml': 'application/xml',
}

export const DEFAULT_MIME_TYPE = 'application/octet-stream'

export function guessMimeType(fileName: string): string {
  const lower = fileName.toLowerCase()
  const dotIndex = lower.lastIndexOf('.')
  if (dotIndex === -1) {
    return DEFAULT_MIME_TYPE
  }
  const extension = lower.slice(dotIndex)
  return EXTENSION_TO_MIME[extension] ?? DEFAULT_MIME_TYPE
}

/**
 * Content types that are safe to render inline. Everything else — including
 * HTML and SVG, which can carry script — must be offered as a download only.
 * Used by both the recovery web UI and the CLI's summary output.
 */
const INLINE_RENDERABLE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp',
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/csv',
])

export function isSafeToRenderInline(mimeType: string): boolean {
  return INLINE_RENDERABLE_TYPES.has(mimeType)
}
