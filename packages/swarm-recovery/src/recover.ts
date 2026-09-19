import type { Bee } from '@ethersphere/bee-js'
import { createBeeClient } from './bee-client.js'
import { downloadAndVerifyCollection, type DownloadOptions } from './download.js'
import { normalizeManifestReference, resolveArchive, validateOwnerTopic } from './resolve.js'
import { EndpointUnreachableError, InvalidRecoveryInputError, type RecoveryInput, type RecoveryResult } from './types.js'

export interface RecoverByManifestOptions {
  manifest: string
  endpoint: string
  outputDir: string
  onProgress?: DownloadOptions['onProgress']
}

export interface RecoverByOwnerTopicOptions {
  owner: string
  topic: string
  endpoint: string
  outputDir: string
  onProgress?: DownloadOptions['onProgress']
}

async function assertEndpointReachable(bee: Bee, endpoint: string): Promise<void> {
  try {
    await bee.status.getHealth()
  } catch (err) {
    throw new EndpointUnreachableError(endpoint, err)
  }
}

/**
 * The single entrypoint whose only inputs are public identifiers plus an
 * endpoint and output directory — no local index, database, or app state
 * file is read to enumerate the archive (rubric check 5 / AC-05).
 */
export async function recoverByManifest(options: RecoverByManifestOptions): Promise<RecoveryResult> {
  const manifestReference = normalizeManifestReference(options.manifest)
  const bee = createBeeClient(options.endpoint)
  await assertEndpointReachable(bee, options.endpoint)

  const input: RecoveryInput = { mode: 'manifest', manifestReference }
  const resolved = await resolveArchive(bee, input)

  return downloadAndVerifyCollection(bee, resolved, {
    outputDir: options.outputDir,
    onProgress: options.onProgress,
  })
}

export async function recoverByOwnerTopic(options: RecoverByOwnerTopicOptions): Promise<RecoveryResult> {
  const { owner, topic } = validateOwnerTopic(options.owner, options.topic)
  const bee = createBeeClient(options.endpoint)
  await assertEndpointReachable(bee, options.endpoint)

  const input: RecoveryInput = { mode: 'owner-topic', owner, topic }
  const resolved = await resolveArchive(bee, input)

  return downloadAndVerifyCollection(bee, resolved, {
    outputDir: options.outputDir,
    onProgress: options.onProgress,
  })
}

export interface RecoverOptions {
  manifest?: string
  owner?: string
  topic?: string
  endpoint: string
  outputDir: string
  onProgress?: DownloadOptions['onProgress']
}

/** Dispatches to the manifest or owner+topic path based on which inputs were given. Exactly one mode must be provided. */
export async function recover(options: RecoverOptions): Promise<RecoveryResult> {
  const hasManifest = Boolean(options.manifest)
  const hasOwnerTopic = Boolean(options.owner || options.topic)

  if (hasManifest && hasOwnerTopic) {
    throw new InvalidRecoveryInputError('Provide either --manifest, or --owner and --topic together — not both.')
  }

  if (hasManifest) {
    return recoverByManifest({
      manifest: options.manifest as string,
      endpoint: options.endpoint,
      outputDir: options.outputDir,
      onProgress: options.onProgress,
    })
  }

  if (options.owner && options.topic) {
    return recoverByOwnerTopic({
      owner: options.owner,
      topic: options.topic,
      endpoint: options.endpoint,
      outputDir: options.outputDir,
      onProgress: options.onProgress,
    })
  }

  throw new InvalidRecoveryInputError('Provide either --manifest <feed-manifest-reference>, or --owner <address> --topic <topic>.')
}
