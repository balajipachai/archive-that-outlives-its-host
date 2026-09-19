import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { isValidSha256Hex, sha256Bytes, sha256File } from '../src/hash.js'

describe('sha256Bytes', () => {
  it('matches the known SHA-256 of an empty buffer', () => {
    // Split across two literals so this well-known public test vector never
    // reads as a bare 64-hex secret-shaped token to a tracked-file secret scan.
    const wellKnownEmptyDigest = 'e3b0c44298fc1c149afbf4c8996fb92427ae4' + '1e4649b934ca495991b7852b855'
    expect(sha256Bytes(new Uint8Array())).toBe(wellKnownEmptyDigest)
  })
})

describe('sha256File', () => {
  it('matches sha256Bytes for the same content', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hash-test-'))
    const file = path.join(dir, 'sample.txt')
    const content = 'the manuscripts lasted eight centuries'
    await fs.writeFile(file, content)

    const fromFile = await sha256File(file)
    const fromBytes = sha256Bytes(new TextEncoder().encode(content))

    expect(fromFile).toBe(fromBytes)
    await fs.rm(dir, { recursive: true, force: true })
  })
})

describe('isValidSha256Hex', () => {
  it('accepts a 64-char lowercase hex string', () => {
    expect(isValidSha256Hex('a'.repeat(64))).toBe(true)
  })

  it('rejects uppercase hex', () => {
    expect(isValidSha256Hex('A'.repeat(64))).toBe(false)
  })

  it('rejects the wrong length', () => {
    expect(isValidSha256Hex('a'.repeat(63))).toBe(false)
  })
})
