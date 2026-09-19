import fs from 'node:fs/promises'
import path from 'node:path'
import type { ArchiveReleaseReceiptV1 } from '@archive/format'

export function releaseReceiptPath(releaseId: string, baseDir = process.cwd()): string {
  return path.join(baseDir, 'published', 'releases', `${releaseId}.json`)
}

/**
 * Public, non-secret receipt for one release: the IDs a reviewer needs to
 * compare without learning any credential (FR-03). This is written for
 * audit only — a later health check always re-reads the node, never this
 * file (PRD §6 FR-05).
 */
export async function writeReleaseReceipt(receipt: ArchiveReleaseReceiptV1, baseDir = process.cwd()): Promise<string> {
  const filePath = releaseReceiptPath(receipt.releaseId, baseDir)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(receipt, null, 2), 'utf8')
  return filePath
}
