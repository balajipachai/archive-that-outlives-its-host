import { BeeResponseError, FeedIndex } from '@ethersphere/bee-js'
import { describe, expect, it, vi } from 'vitest'
import { normalizeManifestReference, resolveArchive, validateOwnerTopic } from '../src/resolve.js'
import { InvalidRecoveryInputError, NoReleasePublishedError } from '../src/types.js'

const HEX64 = 'c'.repeat(64)

describe('normalizeManifestReference', () => {
  it('accepts the displayed bzz:// address form', () => {
    expect(normalizeManifestReference(`bzz://${HEX64}/`)).toBe(HEX64)
  })

  it('accepts a bare manifest reference', () => {
    expect(normalizeManifestReference(HEX64)).toBe(HEX64)
  })

  it('is case-insensitive on input but normalizes to lowercase', () => {
    expect(normalizeManifestReference(HEX64.toUpperCase())).toBe(HEX64)
  })

  it('rejects an invalid reference', () => {
    expect(() => normalizeManifestReference('not-a-reference')).toThrow(InvalidRecoveryInputError)
  })

  it('rejects a reference of the wrong length', () => {
    expect(() => normalizeManifestReference('abc123')).toThrow(InvalidRecoveryInputError)
  })
})

describe('validateOwnerTopic', () => {
  it('accepts a valid address and topic', () => {
    expect(validateOwnerTopic('0x1234567890123456789012345678901234567890', 'master-of-all')).toEqual({
      owner: '0x1234567890123456789012345678901234567890',
      topic: 'master-of-all',
    })
  })

  it('rejects a malformed address', () => {
    expect(() => validateOwnerTopic('not-an-address', 'topic')).toThrow(InvalidRecoveryInputError)
  })

  it('rejects an empty topic', () => {
    expect(() => validateOwnerTopic('0x1234567890123456789012345678901234567890', '  ')).toThrow(InvalidRecoveryInputError)
  })
})

describe('resolveArchive', () => {
  it('manifest mode never reads a local index — it only formats the given reference', async () => {
    const bee = {} as any
    const resolved = await resolveArchive(bee, { mode: 'manifest', manifestReference: HEX64 })
    expect(resolved.addressReference).toBe(HEX64)
    expect(resolved.mode).toBe('manifest')
  })

  it('owner-topic mode constructs a real FeedReader and resolves the live reference', async () => {
    const collectionRef = 'd'.repeat(64)
    const makeReader = vi.fn().mockReturnValue({
      downloadReference: vi.fn().mockResolvedValue({
        reference: { toHex: () => collectionRef },
        feedIndex: FeedIndex.fromBigInt(7n),
      }),
    })
    const bee = { feed: { makeReader } } as any

    const resolved = await resolveArchive(bee, {
      mode: 'owner-topic',
      owner: '0x1234567890123456789012345678901234567890',
      topic: 'master-of-all',
    })

    expect(resolved.addressReference).toBe(collectionRef)
    expect(resolved.feedIndex).toBe('7')
    expect(makeReader).toHaveBeenCalledTimes(1)
  })

  it('maps an empty feed (no updates yet) to NoReleasePublishedError, never an unhandled rejection', async () => {
    const notFound = new BeeResponseError('GET', 'http://localhost:1633/feeds/x/y', 'Not Found', undefined, 404, 'Not Found')
    const makeReader = vi.fn().mockReturnValue({
      downloadReference: vi.fn().mockRejectedValue(notFound),
    })
    const bee = { feed: { makeReader } } as any

    await expect(
      resolveArchive(bee, { mode: 'owner-topic', owner: '0x1234567890123456789012345678901234567890', topic: 'master-of-all' }),
    ).rejects.toThrow(NoReleasePublishedError)
  })
})
