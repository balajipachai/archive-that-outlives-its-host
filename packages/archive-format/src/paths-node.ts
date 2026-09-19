import path from 'node:path'
import { InvalidArchivePathError, normalizeRelativePath } from './paths.js'

/**
 * Joins a trusted output directory with an untrusted relative path from a
 * downloaded manifest, refusing to resolve outside that directory. Node-only
 * (uses `node:path`); used by the recovery CLI and the publisher's directory
 * scanner before touching disk. Never imported by browser bundles.
 */
export function safeJoin(outputDir: string, untrustedRelativePath: string): string {
  const normalized = normalizeRelativePath(untrustedRelativePath)
  const resolvedOutputDir = path.resolve(outputDir)
  const resolvedTarget = path.resolve(resolvedOutputDir, normalized)

  const withSep = resolvedOutputDir.endsWith(path.sep) ? resolvedOutputDir : resolvedOutputDir + path.sep

  if (resolvedTarget !== resolvedOutputDir && !resolvedTarget.startsWith(withSep)) {
    throw new InvalidArchivePathError(untrustedRelativePath, 'resolves outside the output directory')
  }

  return resolvedTarget
}
