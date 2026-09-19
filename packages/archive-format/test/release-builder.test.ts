import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ArchiveLimitExceededError, buildArchiveRelease, EmptyArchiveInputError } from '../src/release-builder.js'

const cleanupDirs: string[] = []

async function makeInputDir(files: Record<string, string>): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'archive-input-'))
  cleanupDirs.push(dir)
  for (const [relativePath, content] of Object.entries(files)) {
    const absolute = path.join(dir, relativePath)
    await fs.mkdir(path.dirname(absolute), { recursive: true })
    await fs.writeFile(absolute, content)
  }
  return dir
}

afterEach(async () => {
  await Promise.all(cleanupDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
})

describe('buildArchiveRelease', () => {
  it('builds a release manifest and stages files with archive-release.json', async () => {
    const inputDir = await makeInputDir({
      'folios/page-001.jpg': 'fake-image-bytes-1',
      'folios/page-002.jpg': 'fake-image-bytes-2',
      'README.txt': 'context for the collection',
    })

    const { release, stagingDir, cleanup } = await buildArchiveRelease({ inputDir, title: 'Spiti Folios v1' })
    cleanupDirs.push(stagingDir)

    expect(release.files).toHaveLength(3)
    expect(release.files.map((f) => f.path).sort()).toEqual(['README.txt', 'folios/page-001.jpg', 'folios/page-002.jpg'])
    expect(release.files.every((f) => /^[0-9a-f]{64}$/.test(f.sha256))).toBe(true)

    const stagedManifest = JSON.parse(await fs.readFile(path.join(stagingDir, 'archive-release.json'), 'utf8'))
    expect(stagedManifest.releaseId).toBe(release.releaseId)

    const stagedFile = await fs.readFile(path.join(stagingDir, 'folios/page-001.jpg'), 'utf8')
    expect(stagedFile).toBe('fake-image-bytes-1')

    await cleanup()
    await expect(fs.stat(stagingDir)).rejects.toThrow()
  })

  it('rejects an empty input directory', async () => {
    const inputDir = await makeInputDir({})
    await expect(buildArchiveRelease({ inputDir, title: 'Empty' })).rejects.toThrow(EmptyArchiveInputError)
  })

  it('enforces the per-file size limit', async () => {
    const inputDir = await makeInputDir({ 'big.txt': 'x'.repeat(1000) })
    await expect(
      buildArchiveRelease({
        inputDir,
        title: 'Too big',
        limits: { maxFileBytes: 10, maxTotalBytes: 10_000, maxFileCount: 10 },
      }),
    ).rejects.toThrow(ArchiveLimitExceededError)
  })

  it('enforces the total size limit', async () => {
    const inputDir = await makeInputDir({ 'a.txt': 'x'.repeat(600), 'b.txt': 'x'.repeat(600) })
    await expect(
      buildArchiveRelease({
        inputDir,
        title: 'Too big overall',
        limits: { maxFileBytes: 10_000, maxTotalBytes: 1000, maxFileCount: 10 },
      }),
    ).rejects.toThrow(ArchiveLimitExceededError)
  })

  it('enforces the file count limit', async () => {
    const inputDir = await makeInputDir({ 'a.txt': 'a', 'b.txt': 'b', 'c.txt': 'c' })
    await expect(
      buildArchiveRelease({
        inputDir,
        title: 'Too many files',
        limits: { maxFileBytes: 10_000, maxTotalBytes: 10_000, maxFileCount: 2 },
      }),
    ).rejects.toThrow(ArchiveLimitExceededError)
  })

  it('never mutates the original input directory', async () => {
    const inputDir = await makeInputDir({ 'a.txt': 'hello' })
    const before = await fs.readdir(inputDir)
    const { stagingDir, cleanup } = await buildArchiveRelease({ inputDir, title: 'Untouched' })
    cleanupDirs.push(stagingDir)
    const after = await fs.readdir(inputDir)
    expect(after).toEqual(before)
    expect(after).not.toContain('archive-release.json')
    await cleanup()
  })
})
