import { BeeResponseError, FeedIndex } from '@ethersphere/bee-js'
import { describe, expect, it, vi } from 'vitest'
import { advanceFeedWithVerification, readCurrentFeed } from '../src/feed.js'
import { FeedVerificationError } from '../src/types.js'

const COLLECTION_REF_A = 'a'.repeat(64)
const COLLECTION_REF_B = 'b'.repeat(64)

function notFoundError() {
  return new BeeResponseError('GET', 'http://localhost:1633/feeds/x/y', 'Not Found', undefined, 404, 'Not Found')
}

function fakeFeedIndex(n: number) {
  return FeedIndex.fromBigInt(BigInt(n))
}

describe('readCurrentFeed', () => {
  it('is guarded: an empty feed (no updates yet) resolves to isEmpty=true, never an unhandled rejection', async () => {
    const reader = { downloadReference: vi.fn().mockRejectedValue(notFoundError()) }
    const result = await readCurrentFeed(reader as any)
    expect(result.isEmpty).toBe(true)
    expect(result.feedIndexNext).toBe('0')
    expect(result.reference).toBeNull()
  })

  it('re-throws an unrelated error rather than swallowing it', async () => {
    const reader = { downloadReference: vi.fn().mockRejectedValue(new TypeError('boom')) }
    await expect(readCurrentFeed(reader as any)).rejects.toThrow('boom')
  })

  it('reports the live feedIndexNext from a network read on a non-empty feed', async () => {
    const reader = {
      downloadReference: vi.fn().mockResolvedValue({
        reference: { toHex: () => COLLECTION_REF_A },
        feedIndex: fakeFeedIndex(3),
        feedIndexNext: fakeFeedIndex(4),
      }),
    }
    const result = await readCurrentFeed(reader as any)
    expect(result.isEmpty).toBe(false)
    expect(result.feedIndex).toBe('3')
    expect(result.feedIndexNext).toBe('4')
    expect(result.reference).toBe(COLLECTION_REF_A)
  })
})

describe('advanceFeedWithVerification', () => {
  it('derives the write index from a live feed read, never a literal or local counter, on first publish', async () => {
    const reader = {
      downloadReference: vi
        .fn()
        // first call: pre-write read -> empty feed
        .mockRejectedValueOnce(notFoundError())
        // second call: read-back after write -> resolves to what we wrote
        .mockResolvedValueOnce({
          reference: { toHex: () => COLLECTION_REF_A },
          feedIndex: fakeFeedIndex(0),
          feedIndexNext: fakeFeedIndex(1),
        }),
    }
    const uploadReference = vi.fn().mockResolvedValue({ reference: { toHex: () => 'soc-ref' } })
    const writer = { uploadReference }

    const result = await advanceFeedWithVerification(reader as any, writer as any, {
      batchId: 'batch-1',
      collectionReference: COLLECTION_REF_A,
    })

    expect(result.feedIndex).toBe('0')
    expect(uploadReference).toHaveBeenCalledTimes(1)
    const [, , options] = uploadReference.mock.calls[0]!
    expect(options.index.toBigInt()).toBe(0n)
  })

  it('resolves the next index from the network (not a literal) on a second release', async () => {
    const reader = {
      downloadReference: vi
        .fn()
        .mockResolvedValueOnce({
          reference: { toHex: () => COLLECTION_REF_A },
          feedIndex: fakeFeedIndex(0),
          feedIndexNext: fakeFeedIndex(1),
        })
        .mockResolvedValueOnce({
          reference: { toHex: () => COLLECTION_REF_B },
          feedIndex: fakeFeedIndex(1),
          feedIndexNext: fakeFeedIndex(2),
        }),
    }
    const uploadReference = vi.fn().mockResolvedValue({ reference: { toHex: () => 'soc-ref' } })
    const writer = { uploadReference }

    const result = await advanceFeedWithVerification(reader as any, writer as any, {
      batchId: 'batch-1',
      collectionReference: COLLECTION_REF_B,
    })

    expect(result.feedIndex).toBe('1')
    const [, , options] = uploadReference.mock.calls[0]!
    expect(options.index.toBigInt()).toBe(1n)
  })

  it('is idempotent: if the feed already resolves to the submitted reference, it succeeds without writing again', async () => {
    const reader = {
      downloadReference: vi.fn().mockResolvedValue({
        reference: { toHex: () => COLLECTION_REF_A },
        feedIndex: fakeFeedIndex(2),
        feedIndexNext: fakeFeedIndex(3),
      }),
    }
    const uploadReference = vi.fn()
    const writer = { uploadReference }

    const result = await advanceFeedWithVerification(reader as any, writer as any, {
      batchId: 'batch-1',
      collectionReference: COLLECTION_REF_A,
    })

    expect(result.feedIndex).toBe('2')
    expect(uploadReference).not.toHaveBeenCalled()
  })

  it('re-reads a fresh index and retries after an ambiguous write failure, rather than reusing a stale index', async () => {
    const reader = {
      downloadReference: vi
        .fn()
        // attempt 1: pre-write read -> empty feed (next index 0); the write then fails
        .mockRejectedValueOnce(notFoundError())
        // attempt 2: pre-write read after the write failure — network has moved on
        .mockResolvedValueOnce({
          reference: { toHex: () => COLLECTION_REF_A },
          feedIndex: fakeFeedIndex(5),
          feedIndexNext: fakeFeedIndex(6),
        })
        // read-back after the successful second write
        .mockResolvedValueOnce({
          reference: { toHex: () => COLLECTION_REF_B },
          feedIndex: fakeFeedIndex(6),
          feedIndexNext: fakeFeedIndex(7),
        }),
    }

    const uploadReference = vi
      .fn()
      .mockRejectedValueOnce(new Error('socket hang up'))
      .mockResolvedValueOnce({ reference: { toHex: () => 'soc-ref' } })
    const writer = { uploadReference }

    const result = await advanceFeedWithVerification(reader as any, writer as any, {
      batchId: 'batch-1',
      collectionReference: COLLECTION_REF_B,
      maxAttempts: 3,
    })

    expect(result.feedIndex).toBe('6')
    expect(uploadReference).toHaveBeenCalledTimes(2)
    const secondCallOptions = uploadReference.mock.calls[1]![2]
    expect(secondCallOptions.index.toBigInt()).toBe(6n)
  })

  it('throws FeedVerificationError if the read-back never resolves to the submitted reference', async () => {
    const reader = {
      downloadReference: vi.fn().mockResolvedValue({
        reference: { toHex: () => COLLECTION_REF_A }, // always the OLD reference
        feedIndex: fakeFeedIndex(0),
        feedIndexNext: fakeFeedIndex(1),
      }),
    }
    const uploadReference = vi.fn().mockResolvedValue({ reference: { toHex: () => 'soc-ref' } })
    const writer = { uploadReference }

    await expect(
      advanceFeedWithVerification(reader as any, writer as any, {
        batchId: 'batch-1',
        collectionReference: COLLECTION_REF_B,
        maxAttempts: 2,
      }),
    ).rejects.toThrow(FeedVerificationError)
  })
})
