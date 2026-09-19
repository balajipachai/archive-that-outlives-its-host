import { describe, expect, it } from 'vitest'
import { assertNoDuplicatePaths, InvalidArchivePathError, normalizeRelativePath } from '../src/paths.js'
import { safeJoin } from '../src/paths-node.js'

describe('normalizeRelativePath', () => {
  it('accepts a simple relative path', () => {
    expect(normalizeRelativePath('folios/page-001.jpg')).toBe('folios/page-001.jpg')
  })

  it('normalizes backslashes to forward slashes', () => {
    expect(normalizeRelativePath('folios\\page-001.jpg')).toBe('folios/page-001.jpg')
  })

  it('drops redundant "." segments', () => {
    expect(normalizeRelativePath('./folios/./page-001.jpg')).toBe('folios/page-001.jpg')
  })

  it('rejects absolute POSIX paths', () => {
    expect(() => normalizeRelativePath('/etc/passwd')).toThrow(InvalidArchivePathError)
  })

  it('rejects absolute Windows paths', () => {
    expect(() => normalizeRelativePath('C:\\Windows\\System32')).toThrow(InvalidArchivePathError)
  })

  it('rejects parent directory traversal', () => {
    expect(() => normalizeRelativePath('../../etc/passwd')).toThrow(InvalidArchivePathError)
  })

  it('rejects traversal embedded mid-path', () => {
    expect(() => normalizeRelativePath('folios/../../secret.txt')).toThrow(InvalidArchivePathError)
  })

  it('rejects empty paths', () => {
    expect(() => normalizeRelativePath('')).toThrow(InvalidArchivePathError)
  })

  it('rejects a path with no real segments', () => {
    expect(() => normalizeRelativePath('./.')).toThrow(InvalidArchivePathError)
  })
})

describe('assertNoDuplicatePaths', () => {
  it('passes for unique paths', () => {
    expect(() => assertNoDuplicatePaths(['a.txt', 'b.txt'])).not.toThrow()
  })

  it('throws for duplicate normalized paths', () => {
    expect(() => assertNoDuplicatePaths(['a.txt', 'a.txt'])).toThrow(InvalidArchivePathError)
  })
})

describe('safeJoin', () => {
  it('joins a normal relative path inside the output directory', () => {
    const joined = safeJoin('/tmp/out', 'folios/page-001.jpg')
    expect(joined.startsWith('/tmp/out')).toBe(true)
    expect(joined.endsWith('folios/page-001.jpg')).toBe(true)
  })

  it('refuses a traversal attempt disguised as a relative path', () => {
    expect(() => safeJoin('/tmp/out', '../../etc/passwd')).toThrow(InvalidArchivePathError)
  })

  it('refuses an absolute path masquerading as a manifest entry', () => {
    expect(() => safeJoin('/tmp/out', '/etc/passwd')).toThrow(InvalidArchivePathError)
  })
})
