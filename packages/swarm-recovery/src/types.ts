export class InvalidRecoveryInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidRecoveryInputError'
  }
}

export class EndpointUnreachableError extends Error {
  constructor(endpoint: string, cause?: unknown) {
    super(`Cannot reach the configured endpoint "${endpoint}"`)
    this.name = 'EndpointUnreachableError'
    if (cause instanceof Error) this.cause = cause
  }
}

export class NoReleasePublishedError extends Error {
  constructor() {
    super('No release has been published yet')
    this.name = 'NoReleasePublishedError'
  }
}

export class MalformedManifestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MalformedManifestError'
  }
}

export class MissingFileError extends Error {
  constructor(public readonly path: string) {
    super(`Expected file "${path}" was not found in the collection`)
    this.name = 'MissingFileError'
  }
}

export class HashMismatchError extends Error {
  constructor(
    public readonly path: string,
    public readonly expected: string,
    public readonly actual: string,
  ) {
    super(`File "${path}" failed hash verification (expected ${expected}, got ${actual})`)
    this.name = 'HashMismatchError'
  }
}

export type RecoveryInput =
  | { mode: 'manifest'; manifestReference: string }
  | { mode: 'owner-topic'; owner: string; topic: string }

export interface ResolvedArchive {
  mode: 'manifest' | 'owner-topic'
  /** What every subsequent /bzz file read uses as its collection reference. */
  addressReference: string
  normalizedInput: string
  feedIndex: string | null
}

export interface RecoveredFile {
  path: string
  contentType: string
  sizeBytes: number
  sha256: string
  verified: boolean
}

export interface RecoveryResult {
  resolved: ResolvedArchive
  releaseId: string
  title: string
  publishedAt: string
  files: RecoveredFile[]
  outputDir: string
}
