import fs from 'node:fs/promises'
import path from 'node:path'

export type PublishStage =
  | 'building-release'
  | 'uploading-collection'
  | 'advancing-feed'
  | 'verifying'
  | 'complete'

/**
 * Non-secret, ignored resume aid for one in-flight publish operation. This
 * is never a recovery/discovery index — the recovery reader never reads it,
 * and it is deleted once the independent feed read-back confirms success.
 */
export interface PendingPublishJournal {
  releaseId: string
  batchId: string
  collectionReference: string | null
  expectedFeedIndex: string | null
  currentFeedIndex: string | null
  stage: PublishStage
  createdAt: string
  updatedAt: string
}

const DEFAULT_JOURNAL_PATH = path.join('state', 'pending-publish.json')

export function journalPath(baseDir = process.cwd()): string {
  return path.join(baseDir, DEFAULT_JOURNAL_PATH)
}

export async function readJournal(filePath: string): Promise<PendingPublishJournal | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    return JSON.parse(raw) as PendingPublishJournal
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
    }
    throw err
  }
}

/** Write-temp-file, fsync, rename — never leaves a torn journal on disk. */
export async function writeJournalAtomic(filePath: string, journal: PendingPublishJournal): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`
  const handle = await fs.open(tempPath, 'w')
  try {
    await handle.writeFile(JSON.stringify(journal, null, 2), 'utf8')
    await handle.sync()
  } finally {
    await handle.close()
  }
  await fs.rename(tempPath, filePath)
}

export async function deleteJournal(filePath: string): Promise<void> {
  await fs.rm(filePath, { force: true })
}
