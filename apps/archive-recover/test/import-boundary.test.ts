import fs from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC_DIR = path.join(import.meta.dirname, '..', 'src')

const FORBIDDEN_SPECIFIERS = [
  'archive-publisher',
  '@archive/swarm-publisher',
  'swarm-publisher',
  'better-sqlite3',
  'sqlite3',
]

async function listTsFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await listTsFiles(full)))
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      files.push(full)
    }
  }
  return files
}

const IMPORT_PATTERN = /(?:from\s+['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\))/g

/**
 * Recovery must never depend on publisher code, credentials, or a
 * publisher-generated local database/index (PRD §5). This test fails the
 * build if any source file under `src/` ever imports one of those.
 */
describe('recovery import boundary', () => {
  it('never imports the publisher app or the publisher swarm adapter', async () => {
    const files = await listTsFiles(SRC_DIR)
    expect(files.length).toBeGreaterThan(0)

    const violations: { file: string; specifier: string }[] = []

    for (const file of files) {
      const content = await fs.readFile(file, 'utf8')
      for (const match of content.matchAll(IMPORT_PATTERN)) {
        const specifier = match[1] ?? match[2] ?? ''
        if (FORBIDDEN_SPECIFIERS.some((forbidden) => specifier.includes(forbidden))) {
          violations.push({ file: path.relative(SRC_DIR, file), specifier })
        }
      }
    }

    expect(violations).toEqual([])
  })

  it('never reads a local index/state file path to enumerate the archive', async () => {
    const files = await listTsFiles(SRC_DIR)
    const suspiciousPatterns = [/pending-publish\.json/, /archive-publication\.json/, /state\/[a-zA-Z-]+\.json/]

    const violations: string[] = []
    for (const file of files) {
      const content = await fs.readFile(file, 'utf8')
      for (const pattern of suspiciousPatterns) {
        if (pattern.test(content)) {
          violations.push(`${path.relative(SRC_DIR, file)} matches ${pattern}`)
        }
      }
    }

    expect(violations).toEqual([])
  })
})
