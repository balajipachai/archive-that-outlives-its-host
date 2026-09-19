import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { BeeResponseError } from '@ethersphere/bee-js'
import { afterEach, describe, expect, it } from 'vitest'
import { downloadAndVerifyCollection } from '../src/download.js'
import { HashMismatchError, MalformedManifestError, MissingFileError, type ResolvedArchive } from '../src/types.js'

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

const resolved: ResolvedArchive = {
  mode: 'manifest',
  addressReference: 'c'.repeat(64),
  normalizedInput: `bzz://${'c'.repeat(64)}/`,
  feedIndex: null,
}

const cleanupDirs: string[] = []
afterEach(async () => {
  await Promise.all(cleanupDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
})

async function tempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'recover-out-'))
  cleanupDirs.push(dir)
  return dir
}

function fakeBee(files: Record<string, string | Error>) {
  return {
    file: {
      download: async (_ref: string, filePath?: string) => {
        const entry = files[filePath ?? '']
        if (entry === undefined) throw new Error(`unexpected download of "${filePath}"`)
        if (entry instanceof Error) throw entry
        return { data: { toUint8Array: () => new TextEncoder().encode(entry) } }
      },
    },
  } as any
}

function notFound() {
  return new BeeResponseError('GET', 'http://localhost:1633/bzz/x', 'Not Found', undefined, 404, 'Not Found')
}

describe('downloadAndVerifyCollection', () => {
  it('downloads every file, verifies its hash, and writes it under the output directory', async () => {
    const content = 'page one content'
    const release = {
      format: 'org.road-to-devcon.archive-release',
      version: 1,
      releaseId: 'r1',
      title: 'Spiti Folios v1',
      publishedAt: new Date().toISOString(),
      files: [{ path: 'folios/page-001.txt', contentType: 'text/plain', sizeBytes: content.length, sha256: sha256(content) }],
    }

    const bee = fakeBee({
      'archive-release.json': JSON.stringify(release),
      'folios/page-001.txt': content,
    })

    const outputDir = await tempDir()
    const result = await downloadAndVerifyCollection(bee, resolved, { outputDir })

    expect(result.files).toHaveLength(1)
    expect(result.files[0]!.verified).toBe(true)

    const written = await fs.readFile(path.join(outputDir, 'folios/page-001.txt'), 'utf8')
    expect(written).toBe(content)
  })

  it('works from a completely empty output directory', async () => {
    const outputDir = await tempDir()
    const before = await fs.readdir(outputDir)
    expect(before).toEqual([])

    const content = 'x'
    const release = {
      format: 'org.road-to-devcon.archive-release',
      version: 1,
      releaseId: 'r1',
      title: 'T',
      publishedAt: new Date().toISOString(),
      files: [{ path: 'a.txt', contentType: 'text/plain', sizeBytes: 1, sha256: sha256(content) }],
    }
    const bee = fakeBee({ 'archive-release.json': JSON.stringify(release), 'a.txt': content })

    await downloadAndVerifyCollection(bee, resolved, { outputDir })
    expect((await fs.readdir(outputDir)).sort()).toEqual(['a.txt', 'archive-release.json'])
  })

  it('throws MissingFileError when archive-release.json is absent (empty/unknown collection)', async () => {
    const bee = fakeBee({ 'archive-release.json': notFound() })
    const outputDir = await tempDir()
    await expect(downloadAndVerifyCollection(bee, resolved, { outputDir })).rejects.toThrow(MissingFileError)
  })

  it('throws MalformedManifestError for an invalid archive-release.json', async () => {
    const bee = fakeBee({ 'archive-release.json': JSON.stringify({ not: 'a release' }) })
    const outputDir = await tempDir()
    await expect(downloadAndVerifyCollection(bee, resolved, { outputDir })).rejects.toThrow(MalformedManifestError)
  })

  it('throws MissingFileError when a listed file is absent from the collection', async () => {
    const release = {
      format: 'org.road-to-devcon.archive-release',
      version: 1,
      releaseId: 'r1',
      title: 'T',
      publishedAt: new Date().toISOString(),
      files: [{ path: 'missing.txt', contentType: 'text/plain', sizeBytes: 1, sha256: sha256('x') }],
    }
    const bee = fakeBee({ 'archive-release.json': JSON.stringify(release), 'missing.txt': notFound() })
    const outputDir = await tempDir()
    await expect(downloadAndVerifyCollection(bee, resolved, { outputDir })).rejects.toThrow(MissingFileError)
  })

  it('throws HashMismatchError when downloaded content does not match the manifest', async () => {
    const release = {
      format: 'org.road-to-devcon.archive-release',
      version: 1,
      releaseId: 'r1',
      title: 'T',
      publishedAt: new Date().toISOString(),
      files: [{ path: 'a.txt', contentType: 'text/plain', sizeBytes: 1, sha256: sha256('expected') }],
    }
    const bee = fakeBee({ 'archive-release.json': JSON.stringify(release), 'a.txt': 'tampered' })
    const outputDir = await tempDir()
    await expect(downloadAndVerifyCollection(bee, resolved, { outputDir })).rejects.toThrow(HashMismatchError)
  })

  it('rejects a manifest whose file path tries to escape the output directory', async () => {
    const release = {
      format: 'org.road-to-devcon.archive-release',
      version: 1,
      releaseId: 'r1',
      title: 'T',
      publishedAt: new Date().toISOString(),
      files: [{ path: '../../etc/passwd', contentType: 'text/plain', sizeBytes: 1, sha256: sha256('x') }],
    }
    const bee = fakeBee({ 'archive-release.json': JSON.stringify(release) })
    const outputDir = await tempDir()
    // Schema validation rejects the traversal path before any file download is attempted.
    await expect(downloadAndVerifyCollection(bee, resolved, { outputDir })).rejects.toThrow(MalformedManifestError)
  })
})
