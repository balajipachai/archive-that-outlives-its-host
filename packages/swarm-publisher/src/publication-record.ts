import fs from 'node:fs/promises'
import path from 'node:path'
import { parseArchivePublicationRecord, type ArchivePublicationRecordV1 } from '@archive/format'
import { PublicationRecordMismatchError } from './types.js'

const DEFAULT_RECORD_PATH = path.join('published', 'archive-publication.json')

export function publicationRecordPath(baseDir = process.cwd()): string {
  return path.join(baseDir, DEFAULT_RECORD_PATH)
}

export async function readPublicationRecord(filePath: string): Promise<ArchivePublicationRecordV1 | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    return parseArchivePublicationRecord(JSON.parse(raw))
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
    }
    throw err
  }
}

/** Write-temp-file, fsync, rename — the operator commits the real file after a live read-back. */
export async function writePublicationRecordAtomic(
  filePath: string,
  record: ArchivePublicationRecordV1,
): Promise<void> {
  parseArchivePublicationRecord(record) // fail closed before writing
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`
  const handle = await fs.open(tempPath, 'w')
  try {
    await handle.writeFile(JSON.stringify(record, null, 2), 'utf8')
    await handle.sync()
  } finally {
    await handle.close()
  }
  await fs.rename(tempPath, filePath)
}

/**
 * On an existing setup, `archive:init`/`archive:publish` must fail closed
 * rather than silently replace the feed manifest or topic when the derived
 * key or requested configuration disagrees with the committed record
 * (PRD §4.1a item 3). Call this before any write once a record exists.
 */
export function assertMatchesExistingRecord(
  existing: ArchivePublicationRecordV1,
  derived: { ownerAddress: string; topic: string },
): void {
  const ownerMatches = existing.feed.owner.toLowerCase() === derived.ownerAddress.toLowerCase()
  const topicMatches = existing.feed.topic === derived.topic

  if (!ownerMatches || !topicMatches) {
    throw new PublicationRecordMismatchError(
      `published/archive-publication.json already records owner=${existing.feed.owner} topic="${existing.feed.topic}", ` +
        `but the current signing key/topic resolve to owner=${derived.ownerAddress} topic="${derived.topic}". ` +
        'Refusing to replace the existing feed manifest. Restore the matching key or start a new topic deliberately.',
    )
  }
}
