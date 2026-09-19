import { BeeResponseError, Topic, type Bee } from '@ethersphere/bee-js'
import { InvalidRecoveryInputError, NoReleasePublishedError, type RecoveryInput, type ResolvedArchive } from './types.js'

const HEX64 = /^[0-9a-f]{64}$/
const ETH_ADDRESS = /^0x[0-9a-fA-F]{40}$/

/**
 * Accepts exactly what a stranger could have been handed: the displayed
 * `bzz://<ref>/` address, a bare 64-hex manifest reference, or an
 * owner+topic pair. No input form depends on a publisher-domain URL, local
 * file, or hidden lookup service (PRD §5 "Normative recovery resolver").
 */
export function normalizeManifestReference(raw: string): string {
  const trimmed = raw.trim()
  const withoutScheme = trimmed.replace(/^bzz:\/\//i, '')
  const withoutTrailingSlash = withoutScheme.replace(/\/+$/, '')
  const lower = withoutTrailingSlash.toLowerCase()

  if (!HEX64.test(lower)) {
    throw new InvalidRecoveryInputError(
      `"${raw}" is not a valid archive address. Expected the bzz://<64-hex>/ address or a bare 64-character hex manifest reference.`,
    )
  }

  return lower
}

export function validateOwnerTopic(owner: string, topic: string): { owner: string; topic: string } {
  if (!ETH_ADDRESS.test(owner)) {
    throw new InvalidRecoveryInputError(`"${owner}" is not a valid 0x-prefixed Ethereum address.`)
  }
  if (!topic || topic.trim().length === 0) {
    throw new InvalidRecoveryInputError('Topic must not be empty.')
  }
  return { owner, topic: topic.trim() }
}

/**
 * Resolves the archive per the normative table:
 *  - manifest input: the /bzz/<manifestRef>/ path is what every subsequent
 *    file read uses; Bee follows the feed indirection server-side.
 *  - owner+topic input: a real FeedReader is constructed and the current
 *    feed reference is downloaded live, explicitly handling the no-update
 *    case rather than assuming a value.
 */
export async function resolveArchive(bee: Bee, input: RecoveryInput): Promise<ResolvedArchive> {
  if (input.mode === 'manifest') {
    return {
      mode: 'manifest',
      addressReference: input.manifestReference,
      normalizedInput: `bzz://${input.manifestReference}/`,
      feedIndex: null,
    }
  }

  const reader = bee.feed.makeReader(Topic.fromString(input.topic), input.owner)

  let downloadResult
  try {
    downloadResult = await reader.downloadReference()
  } catch (err) {
    if (err instanceof BeeResponseError) {
      throw new NoReleasePublishedError()
    }
    throw err
  }

  return {
    mode: 'owner-topic',
    addressReference: downloadResult.reference.toHex(),
    normalizedInput: `owner=${input.owner} topic=${input.topic}`,
    feedIndex: downloadResult.feedIndex.toBigInt().toString(),
  }
}
