export interface ArchiveFileEntry {
  path: string
  contentType: string
  sizeBytes: number
  sha256: string
  description?: string
}

export interface ArchiveReleaseV1 {
  format: 'org.road-to-devcon.archive-release'
  version: 1
  releaseId: string
  title: string
  publishedAt: string
  files: ArchiveFileEntry[]
}

export interface ArchivePublicationRecordV1 {
  format: 'org.road-to-devcon.archive-publication'
  version: 1
  feed: {
    owner: string
    topic: string
    manifestReference: string
  }
  initializationBatchId: string
  archiveAddress: string
  createdAt: string
  recovery: {
    inputOptions: string[]
    collectionEndpointFamily: 'bzz'
    addressGrammar: string
  }
}

/** Public, non-secret receipt written after each successful release. */
export interface ArchiveReleaseReceiptV1 {
  format: 'org.road-to-devcon.archive-release-receipt'
  version: 1
  releaseId: string
  feedManifestReference: string
  collectionReference: string
  feedIndex: string
  batchId: string
  immutableObservedAt: string
  batchDurationObservedAt: string
  batchDurationSeconds: number | null
  publishedAt: string
  fileCount: number
  totalSizeBytes: number
}
