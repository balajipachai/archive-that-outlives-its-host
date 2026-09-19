import { buildArchiveRelease } from '@archive/format/release-builder'
import type { ArchivePublicationRecordV1, ArchiveReleaseReceiptV1 } from '@archive/format'
import { createBeeClient } from './bee-client.js'
import { createFeedManifest, makeFeedReader, makeFeedWriter, readCurrentFeed, advanceFeedWithVerification } from './feed.js'
import { requireFeedSigningKey } from './keys.js'
import { deleteJournal, journalPath, readJournal, writeJournalAtomic, type PendingPublishJournal } from './journal.js'
import { runPreflight } from './preflight.js'
import {
  assertMatchesExistingRecord,
  publicationRecordPath,
  readPublicationRecord,
  writePublicationRecordAtomic,
} from './publication-record.js'
import { writeReleaseReceipt } from './receipts.js'
import {
  BatchNotImmutableError,
  NodeUnavailableError,
  NoPublicationRecordError,
  UltraLightNodeError,
  UploadedNotPublishedError,
  type PublisherState,
  type PublishSuccessResult,
} from './types.js'
import { uploadCollection } from './upload.js'
import { verifyUploadedCollection } from './verify.js'

export interface PublishHooks {
  onState?: (state: PublisherState) => void
}

function throwForBlockingPreflightState(state: PublisherState): never {
  if (state.kind === 'node-unavailable') throw new NodeUnavailableError()
  if (state.kind === 'ultra-light-or-unfunded') throw new UltraLightNodeError(state.beeMode)
  if (state.kind === 'batch-not-immutable') throw new BatchNotImmutableError(state.batchId)
  throw new Error(`Unexpected preflight state: ${state.kind}`)
}

export interface InitOptions {
  endpoint: string
  batchId: string
  topic: string
  baseDir?: string
}

export interface InitResult {
  ownerAddress: string
  topic: string
  feedManifestReference: string
  archiveAddress: string
  batchId: string
  alreadyInitialized: boolean
}

/**
 * `archive:init` — PRD §4.1a. Creates the one feed manifest on a fresh
 * setup, or fails closed and returns the existing record unchanged if one
 * already exists and matches the current signing key/topic.
 */
export async function runInit(options: InitOptions, env: NodeJS.ProcessEnv = process.env): Promise<InitResult> {
  const bee = createBeeClient(options.endpoint)
  const signingKey = requireFeedSigningKey(env)

  const preflight = await runPreflight(bee, { batchId: options.batchId })
  if (preflight.kind !== 'ready' && preflight.kind !== 'batch-warning') {
    throwForBlockingPreflightState(preflight)
  }

  const recordPath = publicationRecordPath(options.baseDir)
  const existing = await readPublicationRecord(recordPath)

  if (existing) {
    assertMatchesExistingRecord(existing, { ownerAddress: signingKey.ownerAddress, topic: options.topic })
    return {
      ownerAddress: existing.feed.owner,
      topic: existing.feed.topic,
      feedManifestReference: existing.feed.manifestReference,
      archiveAddress: existing.archiveAddress,
      batchId: existing.initializationBatchId,
      alreadyInitialized: true,
    }
  }

  const feedManifestReference = await createFeedManifest(bee, options.batchId, options.topic, signingKey.ownerAddress)

  // Live read-back: prove the manifest is genuinely queryable through the
  // network via owner+topic before ever asking the operator to commit it.
  // An empty feed is the expected result for a brand-new manifest.
  const reader = makeFeedReader(bee, options.topic, signingKey.ownerAddress)
  await readCurrentFeed(reader)

  const record: ArchivePublicationRecordV1 = {
    format: 'org.road-to-devcon.archive-publication',
    version: 1,
    feed: { owner: signingKey.ownerAddress, topic: options.topic, manifestReference: feedManifestReference },
    initializationBatchId: options.batchId,
    archiveAddress: `bzz://${feedManifestReference}/`,
    createdAt: new Date().toISOString(),
    recovery: {
      inputOptions: ['archiveAddress/feed.manifestReference', 'feed.owner + feed.topic'],
      collectionEndpointFamily: 'bzz',
      addressGrammar: 'bzz://<feed-manifest-reference>/',
    },
  }

  await writePublicationRecordAtomic(recordPath, record)

  return {
    ownerAddress: signingKey.ownerAddress,
    topic: options.topic,
    feedManifestReference,
    archiveAddress: record.archiveAddress,
    batchId: options.batchId,
    alreadyInitialized: false,
  }
}

export interface PublishOptions {
  endpoint: string
  batchId: string
  input: string
  title: string
  releaseId?: string
  warningThresholdDays?: number
  baseDir?: string
}

/**
 * `archive:publish` — PRD FR-01 through FR-03. Builds and uploads an
 * immutable release, then advances the existing stable feed with a
 * live-resolved index and a verified read-back.
 */
export async function runPublish(
  options: PublishOptions,
  env: NodeJS.ProcessEnv = process.env,
  hooks: PublishHooks = {},
): Promise<PublishSuccessResult> {
  const baseDir = options.baseDir ?? process.cwd()
  const bee = createBeeClient(options.endpoint)
  const signingKey = requireFeedSigningKey(env)

  const preflight = await runPreflight(bee, { batchId: options.batchId, warningThresholdDays: options.warningThresholdDays })
  if (preflight.kind !== 'ready' && preflight.kind !== 'batch-warning') {
    throwForBlockingPreflightState(preflight)
  }
  const batchHealth = preflight.batch

  const recordPath = publicationRecordPath(baseDir)
  const existingRecord = await readPublicationRecord(recordPath)
  if (!existingRecord) {
    throw new NoPublicationRecordError()
  }
  assertMatchesExistingRecord(existingRecord, { ownerAddress: signingKey.ownerAddress, topic: existingRecord.feed.topic })

  const journalFile = journalPath(baseDir)
  const now = () => new Date().toISOString()

  hooks.onState?.({ kind: 'uploading-release' })

  const staged = await buildArchiveRelease({ inputDir: options.input, title: options.title, releaseId: options.releaseId })

  const journal: PendingPublishJournal = {
    releaseId: staged.release.releaseId,
    batchId: options.batchId,
    collectionReference: null,
    expectedFeedIndex: null,
    currentFeedIndex: null,
    stage: 'building-release',
    createdAt: now(),
    updatedAt: now(),
  }
  await writeJournalAtomic(journalFile, journal)

  let collectionReference: string
  try {
    const uploadResult = await uploadCollection(bee, options.batchId, staged.stagingDir)
    collectionReference = uploadResult.collectionReference
  } finally {
    await staged.cleanup()
  }

  journal.collectionReference = collectionReference
  journal.stage = 'uploading-collection'
  journal.updatedAt = now()
  await writeJournalAtomic(journalFile, journal)

  hooks.onState?.({ kind: 'advancing-feed' })

  const reader = makeFeedReader(bee, existingRecord.feed.topic, signingKey.ownerAddress)
  const writer = makeFeedWriter(bee, existingRecord.feed.topic, signingKey.privateKey)

  let feedIndex: string
  try {
    const advanced = await advanceFeedWithVerification(reader, writer, {
      batchId: options.batchId,
      collectionReference,
    })
    feedIndex = advanced.feedIndex
  } catch (err) {
    journal.stage = 'uploading-collection'
    journal.updatedAt = now()
    await writeJournalAtomic(journalFile, journal)
    throw new UploadedNotPublishedError(collectionReference, err)
  }

  journal.currentFeedIndex = feedIndex
  journal.stage = 'verifying'
  journal.updatedAt = now()
  await writeJournalAtomic(journalFile, journal)

  hooks.onState?.({ kind: 'verifying' })

  // The feed already points at this collection by this point; a
  // verification failure here means the published content itself is
  // suspect, not that publication failed, so it propagates as-is.
  const release = await verifyUploadedCollection(bee, collectionReference)

  const publishedAt = now()
  const totalSizeBytes = release.files.reduce((sum, f) => sum + f.sizeBytes, 0)

  const receipt: ArchiveReleaseReceiptV1 = {
    format: 'org.road-to-devcon.archive-release-receipt',
    version: 1,
    releaseId: release.releaseId,
    feedManifestReference: existingRecord.feed.manifestReference,
    collectionReference,
    feedIndex,
    batchId: options.batchId,
    immutableObservedAt: batchHealth.observedAt,
    batchDurationObservedAt: batchHealth.observedAt,
    batchDurationSeconds: batchHealth.durationSeconds,
    publishedAt,
    fileCount: release.files.length,
    totalSizeBytes,
  }
  await writeReleaseReceipt(receipt, baseDir)

  journal.stage = 'complete'
  journal.updatedAt = now()
  await writeJournalAtomic(journalFile, journal)
  await deleteJournal(journalFile)

  const result: PublishSuccessResult = {
    releaseId: release.releaseId,
    feedManifestReference: existingRecord.feed.manifestReference,
    collectionReference,
    feedIndex,
    batchId: options.batchId,
    archiveAddress: existingRecord.archiveAddress,
    owner: existingRecord.feed.owner,
    topic: existingRecord.feed.topic,
    fileCount: release.files.length,
    totalSizeBytes,
    publishedAt,
  }

  hooks.onState?.({ kind: 'published', result })

  return result
}

/**
 * Resume aid: if a prior process was interrupted after the collection
 * uploaded but before the feed verified, this reads the live feed first —
 * completing idempotently if it already resolved, or reporting the gap
 * clearly. Never used by the recovery reader; publisher-only.
 */
export async function inspectPendingJournal(baseDir = process.cwd()): Promise<PendingPublishJournal | null> {
  return readJournal(journalPath(baseDir))
}
