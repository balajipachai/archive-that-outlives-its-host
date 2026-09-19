import type { Bee } from '@ethersphere/bee-js'
import { parseArchiveRelease, type ArchiveReleaseV1 } from '@archive/format'
import { sha256Bytes } from '@archive/format/hash'
import { CollectionVerificationError } from './types.js'

/**
 * Re-fetches every file the just-uploaded collection claims to contain,
 * straight from the network, and confirms each SHA-256 matches. This is
 * what lets the publisher claim "published and recoverable" rather than
 * just "upload returned a reference" — the same check a stranger's reader
 * performs (FR-04), run once more by the publisher before it declares
 * success (state model's `published` requires "all files verify").
 */
export async function verifyUploadedCollection(bee: Bee, collectionReference: string): Promise<ArchiveReleaseV1> {
  const manifestFile = await bee.file.download(collectionReference, 'archive-release.json')
  const release = parseArchiveRelease(manifestFile.data.toJSON())

  for (const entry of release.files) {
    const fileData = await bee.file.download(collectionReference, entry.path)
    const actualSha256 = sha256Bytes(fileData.data.toUint8Array())
    if (actualSha256 !== entry.sha256) {
      throw new CollectionVerificationError(
        `File "${entry.path}" hash mismatch after upload: expected ${entry.sha256}, got ${actualSha256}`,
      )
    }
  }

  return release
}
