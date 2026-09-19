/** The states from PRD §4.3 that the preflight/publish flow can report. */
export type PublisherState =
  | { kind: 'node-unavailable'; detail: string }
  | { kind: 'ultra-light-or-unfunded'; detail: string; beeMode: string }
  | { kind: 'batch-not-immutable'; detail: string; batchId: string }
  | { kind: 'ready'; batch: BatchHealth }
  | { kind: 'batch-warning'; batch: BatchHealth }
  | { kind: 'uploading-release' }
  | { kind: 'advancing-feed' }
  | { kind: 'verifying' }
  | { kind: 'published'; result: PublishSuccessResult }
  | { kind: 'uploaded-not-published'; collectionReference: string; reason: string }

export interface BatchHealth {
  batchId: string
  usable: boolean
  immutableFlag: boolean
  utilization: number
  durationSeconds: number
  observedAt: string
  warning: boolean
  warningThresholdDays: number
}

export interface PublishSuccessResult {
  releaseId: string
  feedManifestReference: string
  collectionReference: string
  feedIndex: string
  batchId: string
  archiveAddress: string
  owner: string
  topic: string
  fileCount: number
  totalSizeBytes: number
  publishedAt: string
}

export interface PublisherOperationInput {
  endpoint: string
  batchId: string
}

export class NodeUnavailableError extends Error {
  constructor(cause?: unknown) {
    super('Cannot reach this Bee node')
    this.name = 'NodeUnavailableError'
    if (cause instanceof Error) this.cause = cause
  }
}

export class UltraLightNodeError extends Error {
  constructor(public readonly beeMode: string) {
    super('This node can read but cannot publish yet')
    this.name = 'UltraLightNodeError'
  }
}

export class BatchNotImmutableError extends Error {
  constructor(public readonly batchId: string) {
    super('This batch cannot be used for a preservation release')
    this.name = 'BatchNotImmutableError'
  }
}

export class BatchUnavailableError extends Error {
  constructor(public readonly batchId: string, cause?: unknown) {
    super(`Batch "${batchId}" could not be read from the node`)
    this.name = 'BatchUnavailableError'
    if (cause instanceof Error) this.cause = cause
  }
}

export class PublishingKeyUnavailableError extends Error {
  constructor() {
    super("The archive's publishing key is unavailable; recovery reading still works")
    this.name = 'PublishingKeyUnavailableError'
  }
}

export class PublicationRecordMismatchError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PublicationRecordMismatchError'
  }
}

export class FeedVerificationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FeedVerificationError'
  }
}

export class CollectionVerificationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CollectionVerificationError'
  }
}

/**
 * The collection uploaded successfully but the feed update failed or did
 * not verify. Carries the collection reference so the operator can retry
 * only feed advancement, never a claim of publication.
 */
export class UploadedNotPublishedError extends Error {
  constructor(
    public readonly collectionReference: string,
    cause?: unknown,
  ) {
    super('Release uploaded, but the public address still points to the previous release')
    this.name = 'UploadedNotPublishedError'
    if (cause instanceof Error) this.cause = cause
  }
}

export class NoPublicationRecordError extends Error {
  constructor() {
    super('No publication record found. Run archive:init first to create the feed manifest.')
    this.name = 'NoPublicationRecordError'
  }
}
