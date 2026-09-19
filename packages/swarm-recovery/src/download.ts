import fs from 'node:fs/promises'
import path from 'node:path'
import { BeeResponseError, type Bee } from '@ethersphere/bee-js'
import { ArchiveFormatValidationError, parseArchiveRelease } from '@archive/format'
import { sha256Bytes } from '@archive/format/hash'
import { safeJoin } from '@archive/format/paths-node'
import {
  HashMismatchError,
  MalformedManifestError,
  MissingFileError,
  type RecoveredFile,
  type RecoveryResult,
  type ResolvedArchive,
} from './types.js'

export interface DownloadOptions {
  outputDir: string
  onProgress?: (event: { path: string; index: number; total: number }) => void
}

/**
 * Reads `archive-release.json` from the resolved collection, validates it,
 * downloads every listed file, verifies its SHA-256, and writes it under
 * `outputDir` using a traversal-safe join. Works from a completely empty
 * directory — the only inputs are `resolved.addressReference` (derived from
 * public identifiers) and the endpoint already baked into `bee`.
 */
export async function downloadAndVerifyCollection(
  bee: Bee,
  resolved: ResolvedArchive,
  options: DownloadOptions,
): Promise<RecoveryResult> {
  let manifestBytes: Uint8Array
  try {
    const manifestFile = await bee.file.download(resolved.addressReference, 'archive-release.json')
    manifestBytes = manifestFile.data.toUint8Array()
  } catch (err) {
    if (err instanceof BeeResponseError) {
      throw new MissingFileError('archive-release.json')
    }
    throw err
  }

  let releaseJson: unknown
  try {
    releaseJson = JSON.parse(new TextDecoder().decode(manifestBytes))
  } catch {
    throw new MalformedManifestError('archive-release.json is not valid JSON')
  }

  let release
  try {
    release = parseArchiveRelease(releaseJson)
  } catch (err) {
    if (err instanceof ArchiveFormatValidationError) {
      throw new MalformedManifestError(`archive-release.json failed validation: ${err.issues.map((i) => i.message).join('; ')}`)
    }
    throw err
  }

  await fs.mkdir(options.outputDir, { recursive: true })

  const files: RecoveredFile[] = []

  for (const [index, entry] of release.files.entries()) {
    options.onProgress?.({ path: entry.path, index, total: release.files.length })

    let fileBytes: Uint8Array
    try {
      const fileData = await bee.file.download(resolved.addressReference, entry.path)
      fileBytes = fileData.data.toUint8Array()
    } catch (err) {
      if (err instanceof BeeResponseError) {
        throw new MissingFileError(entry.path)
      }
      throw err
    }

    const actualSha256 = sha256Bytes(fileBytes)
    if (actualSha256 !== entry.sha256) {
      throw new HashMismatchError(entry.path, entry.sha256, actualSha256)
    }

    const destination = safeJoin(options.outputDir, entry.path)
    await fs.mkdir(path.dirname(destination), { recursive: true })
    await fs.writeFile(destination, fileBytes)

    files.push({
      path: entry.path,
      contentType: entry.contentType,
      sizeBytes: entry.sizeBytes,
      sha256: entry.sha256,
      verified: true,
    })
  }

  await fs.writeFile(path.join(options.outputDir, 'archive-release.json'), JSON.stringify(release, null, 2), 'utf8')

  return {
    resolved,
    releaseId: release.releaseId,
    title: release.title,
    publishedAt: release.publishedAt,
    files,
    outputDir: options.outputDir,
  }
}
