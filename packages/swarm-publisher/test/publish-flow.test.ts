import { PrivateKey } from '@ethersphere/bee-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BatchNotImmutableError, NodeUnavailableError } from '../src/types.js'

const uploadCollectionMock = vi.fn()
const advanceFeedWithVerificationMock = vi.fn()
const verifyUploadedCollectionMock = vi.fn()
const runPreflightMock = vi.fn()
const readPublicationRecordMock = vi.fn()

vi.mock('../src/bee-client.js', () => ({
  createBeeClient: () => ({}) as unknown,
}))

vi.mock('../src/keys.js', () => ({
  requireFeedSigningKey: () => ({
    privateKey: new PrivateKey('11'.repeat(32)),
    ownerAddress: '0x1234567890123456789012345678901234567890',
  }),
}))

vi.mock('../src/preflight.js', () => ({
  runPreflight: (...args: unknown[]) => runPreflightMock(...args),
}))

vi.mock('../src/upload.js', () => ({
  uploadCollection: (...args: unknown[]) => uploadCollectionMock(...args),
}))

vi.mock('../src/feed.js', async () => {
  const actual = await vi.importActual<typeof import('../src/feed.js')>('../src/feed.js')
  return {
    ...actual,
    makeFeedReader: () => ({}) as unknown,
    makeFeedWriter: () => ({}) as unknown,
    advanceFeedWithVerification: (...args: unknown[]) => advanceFeedWithVerificationMock(...args),
  }
})

vi.mock('../src/verify.js', () => ({
  verifyUploadedCollection: (...args: unknown[]) => verifyUploadedCollectionMock(...args),
}))

vi.mock('../src/publication-record.js', () => ({
  publicationRecordPath: (baseDir: string) => `${baseDir}/published/archive-publication.json`,
  readPublicationRecord: (...args: unknown[]) => readPublicationRecordMock(...args),
  assertMatchesExistingRecord: () => undefined,
  writePublicationRecordAtomic: vi.fn(),
}))

const { runPublish } = await import('../src/publish-flow.js')

beforeEach(() => {
  uploadCollectionMock.mockReset()
  advanceFeedWithVerificationMock.mockReset()
  verifyUploadedCollectionMock.mockReset()
  runPreflightMock.mockReset()
  readPublicationRecordMock.mockReset()
})

describe('runPublish — batch immutability invariant', () => {
  it('refuses to upload or advance the feed when the batch is not immutable', async () => {
    runPreflightMock.mockResolvedValue({ kind: 'batch-not-immutable', detail: 'nope', batchId: 'mutable-batch' })
    readPublicationRecordMock.mockResolvedValue({
      feed: { owner: '0x1234567890123456789012345678901234567890', topic: 'master-of-all', manifestReference: 'a'.repeat(64) },
      archiveAddress: `bzz://${'a'.repeat(64)}/`,
    })

    await expect(
      runPublish({ endpoint: 'http://localhost:1633', batchId: 'mutable-batch', input: '/tmp/does-not-matter', title: 'Test' }),
    ).rejects.toThrow(BatchNotImmutableError)

    expect(uploadCollectionMock).not.toHaveBeenCalled()
    expect(advanceFeedWithVerificationMock).not.toHaveBeenCalled()
  })

  it('refuses to publish when the node is unavailable, before touching the release builder', async () => {
    runPreflightMock.mockResolvedValue({ kind: 'node-unavailable', detail: 'Cannot reach this Bee node' })

    await expect(
      runPublish({ endpoint: 'http://localhost:1633', batchId: 'batch-1', input: '/tmp/does-not-matter', title: 'Test' }),
    ).rejects.toThrow(NodeUnavailableError)

    expect(readPublicationRecordMock).not.toHaveBeenCalled()
    expect(uploadCollectionMock).not.toHaveBeenCalled()
  })
})
