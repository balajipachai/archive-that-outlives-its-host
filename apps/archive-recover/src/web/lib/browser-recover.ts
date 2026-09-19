import type { Bee } from '@ethersphere/bee-js'
import { BeeResponseError } from '@ethersphere/bee-js'
import { ArchiveFormatValidationError, parseArchiveRelease, type ArchiveReleaseV1 } from '@archive/format'
import {
  EndpointUnreachableError,
  InvalidRecoveryInputError,
  createBeeClient,
  normalizeManifestReference,
  resolveArchive,
  validateOwnerTopic,
  type RecoveryInput,
  type ResolvedArchive,
} from '@archive/swarm-recovery'

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
    super(`File "${path}" failed hash verification`)
    this.name = 'HashMismatchError'
  }
}

export interface BrowserRecoveredFile {
  path: string
  contentType: string
  sizeBytes: number
  sha256: string
  bytes: Uint8Array
  verified: boolean
}

export interface BrowserRecoveryResult {
  resolved: ResolvedArchive
  release: ArchiveReleaseV1
  files: BrowserRecoveredFile[]
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes.slice().buffer as ArrayBuffer)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export interface BrowserRecoverInput {
  mode: 'manifest' | 'owner-topic'
  manifest?: string
  owner?: string
  topic?: string
  endpoint: string
  onProgress?: (event: { path: string; index: number; total: number }) => void
}

async function assertEndpointReachable(bee: Bee, endpoint: string): Promise<void> {
  try {
    await bee.status.getHealth()
  } catch (err) {
    throw new EndpointUnreachableError(endpoint, err)
  }
}

/**
 * Browser-side counterpart to `@archive/swarm-recovery/node`'s
 * `downloadAndVerifyCollection` — same resolution and verification logic,
 * but it never touches the filesystem. Callers save `result.files[i].bytes`
 * with the browser's own file-save mechanism (see `save-files.ts`).
 */
export async function browserRecover(input: BrowserRecoverInput): Promise<BrowserRecoveryResult> {
  const bee = createBeeClient(input.endpoint)
  await assertEndpointReachable(bee, input.endpoint)

  let recoveryInput: RecoveryInput
  if (input.mode === 'manifest') {
    if (!input.manifest) throw new InvalidRecoveryInputError('Enter a manifest reference or bzz:// address.')
    recoveryInput = { mode: 'manifest', manifestReference: normalizeManifestReference(input.manifest) }
  } else {
    const { owner, topic } = validateOwnerTopic(input.owner ?? '', input.topic ?? '')
    recoveryInput = { mode: 'owner-topic', owner, topic }
  }

  const resolved = await resolveArchive(bee, recoveryInput)

  let manifestBytes: Uint8Array
  try {
    const manifestFile = await bee.file.download(resolved.addressReference, 'archive-release.json')
    manifestBytes = manifestFile.data.toUint8Array()
  } catch (err) {
    if (err instanceof BeeResponseError) throw new MissingFileError('archive-release.json')
    throw err
  }

  let releaseJson: unknown
  try {
    releaseJson = JSON.parse(new TextDecoder().decode(manifestBytes))
  } catch {
    throw new MalformedManifestError('archive-release.json is not valid JSON')
  }

  let release: ArchiveReleaseV1
  try {
    release = parseArchiveRelease(releaseJson)
  } catch (err) {
    if (err instanceof ArchiveFormatValidationError) {
      throw new MalformedManifestError(
        `archive-release.json failed validation: ${err.issues.map((i) => i.message).join('; ')}`,
      )
    }
    throw err
  }

  const files: BrowserRecoveredFile[] = []
  for (const [index, entry] of release.files.entries()) {
    input.onProgress?.({ path: entry.path, index, total: release.files.length })

    let bytes: Uint8Array
    try {
      const fileData = await bee.file.download(resolved.addressReference, entry.path)
      bytes = fileData.data.toUint8Array()
    } catch (err) {
      if (err instanceof BeeResponseError) throw new MissingFileError(entry.path)
      throw err
    }

    const actual = await sha256Hex(bytes)
    if (actual !== entry.sha256) {
      throw new HashMismatchError(entry.path, entry.sha256, actual)
    }

    files.push({
      path: entry.path,
      contentType: entry.contentType,
      sizeBytes: entry.sizeBytes,
      sha256: entry.sha256,
      bytes,
      verified: true,
    })
  }

  return { resolved, release, files }
}
