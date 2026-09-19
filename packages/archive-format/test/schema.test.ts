import { describe, expect, it } from 'vitest'
import {
  ArchiveFormatValidationError,
  parseArchivePublicationRecord,
  parseArchiveRelease,
} from '../src/schema.js'

const validSha = 'a'.repeat(64)
const validHex64 = 'b'.repeat(64)

function validRelease() {
  return {
    format: 'org.road-to-devcon.archive-release',
    version: 1,
    releaseId: 'release-1',
    title: 'Spiti Folios v1',
    publishedAt: new Date().toISOString(),
    files: [
      {
        path: 'folios/page-001.jpg',
        contentType: 'image/jpeg',
        sizeBytes: 1024,
        sha256: validSha,
      },
    ],
  }
}

describe('parseArchiveRelease', () => {
  it('accepts a well-formed release', () => {
    expect(() => parseArchiveRelease(validRelease())).not.toThrow()
  })

  it('rejects an empty file list', () => {
    const release = validRelease()
    release.files = []
    expect(() => parseArchiveRelease(release)).toThrow(ArchiveFormatValidationError)
  })

  it('rejects a bad sha256', () => {
    const release = validRelease()
    release.files[0]!.sha256 = 'not-a-hash'
    expect(() => parseArchiveRelease(release)).toThrow(ArchiveFormatValidationError)
  })

  it('rejects a path escaping the archive', () => {
    const release = validRelease()
    release.files[0]!.path = '../../etc/passwd'
    expect(() => parseArchiveRelease(release)).toThrow(ArchiveFormatValidationError)
  })

  it('rejects duplicate normalized paths', () => {
    const release = validRelease()
    release.files.push({ ...release.files[0]! })
    expect(() => parseArchiveRelease(release)).toThrow(ArchiveFormatValidationError)
  })

  it('rejects the wrong format literal', () => {
    const release = { ...validRelease(), format: 'something-else' }
    expect(() => parseArchiveRelease(release)).toThrow(ArchiveFormatValidationError)
  })
})

describe('parseArchivePublicationRecord', () => {
  function validRecord() {
    return {
      format: 'org.road-to-devcon.archive-publication',
      version: 1,
      feed: {
        owner: '0x1234567890123456789012345678901234567890',
        topic: 'spiti-folios-v1',
        manifestReference: validHex64,
      },
      initializationBatchId: validHex64,
      archiveAddress: `bzz://${validHex64}/`,
      createdAt: new Date().toISOString(),
      recovery: {
        inputOptions: ['archiveAddress/feed.manifestReference', 'feed.owner + feed.topic'],
        collectionEndpointFamily: 'bzz',
        addressGrammar: '<feed-manifest-reference>',
      },
    }
  }

  it('accepts a well-formed publication record', () => {
    expect(() => parseArchivePublicationRecord(validRecord())).not.toThrow()
  })

  it('rejects a malformed owner address', () => {
    const record = validRecord()
    record.feed.owner = 'not-an-address'
    expect(() => parseArchivePublicationRecord(record)).toThrow(ArchiveFormatValidationError)
  })

  it('rejects an empty topic', () => {
    const record = validRecord()
    record.feed.topic = ''
    expect(() => parseArchivePublicationRecord(record)).toThrow(ArchiveFormatValidationError)
  })

  it('rejects a manifest reference that is not 64 hex chars', () => {
    const record = validRecord()
    record.feed.manifestReference = 'short'
    expect(() => parseArchivePublicationRecord(record)).toThrow(ArchiveFormatValidationError)
  })
})
