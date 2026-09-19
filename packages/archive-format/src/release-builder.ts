import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { DEFAULT_LIMITS, type ArchiveLimits } from './limits.js'
import { guessMimeType } from './mime.js'
import { sha256File } from './hash.js'
import { assertNoDuplicatePaths, InvalidArchivePathError, normalizeRelativePath } from './paths.js'
import { safeJoin } from './paths-node.js'
import { parseArchiveRelease } from './schema.js'
import type { ArchiveFileEntry, ArchiveReleaseV1 } from './types.js'

export class ArchiveLimitExceededError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ArchiveLimitExceededError'
  }
}

export class EmptyArchiveInputError extends Error {
  constructor(inputDir: string) {
    super(`No files found under "${inputDir}". A release must contain at least one file.`)
    this.name = 'EmptyArchiveInputError'
  }
}

async function walkFiles(rootDir: string, currentDir: string, out: string[]): Promise<void> {
  const entries = await fs.readdir(currentDir, { withFileTypes: true })
  for (const entry of entries) {
    const absolute = path.join(currentDir, entry.name)
    if (entry.isSymbolicLink()) {
      // Never follow symlinks into or out of the input directory.
      continue
    }
    if (entry.isDirectory()) {
      await walkFiles(rootDir, absolute, out)
    } else if (entry.isFile()) {
      out.push(absolute)
    }
  }
}

export interface BuildArchiveReleaseOptions {
  inputDir: string
  title: string
  releaseId?: string
  publishedAt?: Date
  descriptions?: Record<string, string>
  limits?: ArchiveLimits
}

export interface StagedRelease {
  release: ArchiveReleaseV1
  /** Temp directory containing every validated file plus archive-release.json, ready to upload. */
  stagingDir: string
  cleanup: () => Promise<void>
}

/**
 * Scans `inputDir`, validates every file against path/size/count limits,
 * computes SHA-256 for each, and materializes a staging directory containing
 * copies of every file plus a root `archive-release.json`. The caller
 * uploads `stagingDir` as the collection and must call `cleanup()` after.
 *
 * The original input directory is never mutated.
 */
export async function buildArchiveRelease(options: BuildArchiveReleaseOptions): Promise<StagedRelease> {
  const limits = options.limits ?? DEFAULT_LIMITS
  const inputDir = path.resolve(options.inputDir)

  const stat = await fs.stat(inputDir).catch(() => null)
  if (!stat || !stat.isDirectory()) {
    throw new Error(`Input path "${inputDir}" is not a directory`)
  }

  const absoluteFiles: string[] = []
  await walkFiles(inputDir, inputDir, absoluteFiles)

  if (absoluteFiles.length === 0) {
    throw new EmptyArchiveInputError(inputDir)
  }

  if (absoluteFiles.length > limits.maxFileCount) {
    throw new ArchiveLimitExceededError(
      `Release contains ${absoluteFiles.length} files, exceeding the configured limit of ${limits.maxFileCount}.`,
    )
  }

  const entries: ArchiveFileEntry[] = []
  const normalizedPaths: string[] = []
  let totalSizeBytes = 0

  for (const absoluteFile of absoluteFiles) {
    const relative = path.relative(inputDir, absoluteFile)
    let normalized: string
    try {
      normalized = normalizeRelativePath(relative)
    } catch (err) {
      if (err instanceof InvalidArchivePathError) throw err
      throw err
    }

    const fileStat = await fs.stat(absoluteFile)
    if (fileStat.size > limits.maxFileBytes) {
      throw new ArchiveLimitExceededError(
        `File "${normalized}" is ${fileStat.size} bytes, exceeding the per-file limit of ${limits.maxFileBytes} bytes.`,
      )
    }
    totalSizeBytes += fileStat.size
    if (totalSizeBytes > limits.maxTotalBytes) {
      throw new ArchiveLimitExceededError(
        `Release total size exceeds the configured limit of ${limits.maxTotalBytes} bytes.`,
      )
    }

    const sha256 = await sha256File(absoluteFile)
    normalizedPaths.push(normalized)
    entries.push({
      path: normalized,
      contentType: guessMimeType(normalized),
      sizeBytes: fileStat.size,
      sha256,
      ...(options.descriptions?.[normalized] ? { description: options.descriptions[normalized] } : {}),
    })
  }

  assertNoDuplicatePaths(normalizedPaths)

  const release: ArchiveReleaseV1 = {
    format: 'org.road-to-devcon.archive-release',
    version: 1,
    releaseId: options.releaseId ?? randomUUID(),
    title: options.title,
    publishedAt: (options.publishedAt ?? new Date()).toISOString(),
    files: entries,
  }

  parseArchiveRelease(release) // fail closed before we ever touch the network

  const stagingDir = await fs.mkdtemp(path.join(os.tmpdir(), 'archive-release-'))

  for (const absoluteFile of absoluteFiles) {
    const relative = normalizeRelativePath(path.relative(inputDir, absoluteFile))
    const destination = safeJoin(stagingDir, relative)
    await fs.mkdir(path.dirname(destination), { recursive: true })
    await fs.copyFile(absoluteFile, destination)
  }

  await fs.writeFile(path.join(stagingDir, 'archive-release.json'), JSON.stringify(release, null, 2), 'utf8')

  const cleanup = async () => {
    await fs.rm(stagingDir, { recursive: true, force: true })
  }

  return { release, stagingDir, cleanup }
}
