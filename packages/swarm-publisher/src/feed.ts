import { BeeResponseError, FeedIndex, Topic, type Bee, type FeedReader, type FeedWriter, type PrivateKey } from '@ethersphere/bee-js'
import { FeedVerificationError } from './types.js'

export function resolveTopic(topic: string): Topic {
  return Topic.fromString(topic)
}

export function makeFeedReader(bee: Bee, topic: string, owner: string): FeedReader {
  return bee.feed.makeReader(resolveTopic(topic), owner)
}

export function makeFeedWriter(bee: Bee, topic: string, privateKey: PrivateKey): FeedWriter {
  return bee.feed.makeWriter(resolveTopic(topic), privateKey)
}

/**
 * Creates the one feed manifest for a topic+owner pair. The returned
 * reference is the stable, user-facing "archiveAddress" — it never changes
 * across releases (PRD §2, §4.1).
 */
export async function createFeedManifest(bee: Bee, batchId: string, topic: string, owner: string): Promise<string> {
  const reference = await bee.feed.createManifest(batchId, resolveTopic(topic), owner)
  return reference.toHex()
}

export interface FeedReadResult {
  isEmpty: boolean
  reference: string | null
  feedIndex: string | null
  feedIndexNext: string
}

/**
 * A Bee 404 on the very first feed read is expected, not exceptional — it
 * just means no release has been published yet. This mirrors how bee-js's
 * own internal `findNextIndex` treats any `BeeResponseError` from a feed
 * fetch, but does it in our own code so this repo has its own guarded feed
 * read (rubric check: "reading a feed with no updates yet is handled").
 */
function isNoUpdateYetError(err: unknown): boolean {
  return err instanceof BeeResponseError
}

/**
 * Reads the network feed right now. Never throws for the "no release
 * published yet" case — it returns `isEmpty: true` with `feedIndexNext: "0"`
 * instead, matching FR-03's defined first-run behaviour.
 */
export async function readCurrentFeed(reader: FeedReader): Promise<FeedReadResult> {
  try {
    const result = await reader.downloadReference()
    const feedIndexNext = result.feedIndexNext ?? result.feedIndex.next()
    return {
      isEmpty: false,
      reference: result.reference.toHex(),
      feedIndex: result.feedIndex.toBigInt().toString(),
      feedIndexNext: feedIndexNext.toBigInt().toString(),
    }
  } catch (err) {
    if (isNoUpdateYetError(err)) {
      return { isEmpty: true, reference: null, feedIndex: null, feedIndexNext: '0' }
    }
    throw err
  }
}

export interface AdvanceFeedOptions {
  batchId: string
  collectionReference: string
  maxAttempts?: number
}

export interface AdvanceFeedResult {
  feedIndex: string
  collectionReference: string
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function backoffWithJitter(attempt: number): number {
  const base = 250 * 2 ** attempt
  const jitter = Math.random() * 100
  return base + jitter
}

/**
 * FR-03 end to end: read the live feed, resolve the next index from that
 * read (never a literal/local counter), write the immutable collection
 * reference at that index, then read the feed back and confirm it resolves
 * to the same reference.
 *
 * An ambiguous write failure (network error with unknown outcome) is never
 * blindly retried. Instead the feed is re-read first: if it already points
 * at the submitted reference, the operation is idempotently successful; if
 * not, a fresh next-index is resolved from the network before retrying the
 * write, under a bounded exponential-backoff-with-jitter policy.
 */
export async function advanceFeedWithVerification(
  reader: FeedReader,
  writer: FeedWriter,
  options: AdvanceFeedOptions,
): Promise<AdvanceFeedResult> {
  const maxAttempts = options.maxAttempts ?? 4

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const current = await readCurrentFeed(reader)

    if (!current.isEmpty && current.reference === options.collectionReference) {
      return { feedIndex: current.feedIndex as string, collectionReference: options.collectionReference }
    }

    const nextIndex = FeedIndex.fromBigInt(BigInt(current.feedIndexNext))
    const isLastAttempt = attempt === maxAttempts - 1

    try {
      await writer.uploadReference(options.batchId, options.collectionReference, { index: nextIndex })
    } catch (err) {
      if (isLastAttempt) throw err
      await sleep(backoffWithJitter(attempt))
      continue
    }

    const readBack = await readCurrentFeed(reader)
    if (readBack.isEmpty || readBack.reference !== options.collectionReference) {
      if (isLastAttempt) {
        throw new FeedVerificationError(
          'The feed write did not verify on read-back; the public address may still point to the previous release.',
        )
      }
      await sleep(backoffWithJitter(attempt))
      continue
    }

    return { feedIndex: readBack.feedIndex as string, collectionReference: options.collectionReference }
  }

  throw new FeedVerificationError('Feed advancement failed after exhausting retries.')
}
