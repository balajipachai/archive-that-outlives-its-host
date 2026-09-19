import type { Bee } from '@ethersphere/bee-js'

export interface UploadCollectionResult {
  collectionReference: string
}

/**
 * Uploads the staged release directory as one Swarm collection. This
 * reference is what the feed points to — the feed never carries archive
 * bytes directly (FR-02: `uploadReference`, never `uploadPayload`).
 */
export async function uploadCollection(bee: Bee, batchId: string, stagingDir: string): Promise<UploadCollectionResult> {
  const result = await bee.collection.uploadFromDirectory(batchId, stagingDir)
  return { collectionReference: result.reference.toHex() }
}
