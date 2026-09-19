#!/usr/bin/env node
// Scans every git-tracked file for private keys, mnemonics, gift codes, and
// authenticated URLs. Run before every commit and in CI (PRD §10, rubric
// check 8). Exits non-zero and prints every match if anything is found.

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'

const PATTERNS = [
  {
    name: 'hex-private-key (64 hex chars, likely a secp256k1 key)',
    // Matches a bare 64-hex-char token. Known-safe identifiers (batch IDs,
    // manifest/collection references, addresses padded to 32 bytes) are
    // expected and allowlisted per-file below rather than by pattern,
    // because the shape is genuinely indistinguishable from a private key.
    regex: /\b(?:0x)?[0-9a-fA-F]{64}\b/g,
  },
  {
    name: 'bip39-style mnemonic (12+ lowercase words in a labeled field)',
    regex: /\b(?:mnemonic|seed[_-]?phrase)\b\s*[:=]\s*["']?(?:[a-z]+\s+){11,}[a-z]+["']?/gi,
  },
  {
    name: 'gift code',
    regex: /\bgift[_-]?code\b\s*[:=]\s*["']?0x[0-9a-fA-F]+/gi,
  },
  {
    name: 'authenticated URL (userinfo in a URL)',
    regex: /https?:\/\/[^\s"'/]+:[^\s"'/@]+@[^\s"']+/g,
  },
  {
    name: 'PEM private key block',
    regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  },
]

// Paths where a 64-hex-char token is expected and known to be public (batch
// IDs, manifest/collection references in the publication record and release
// receipts) — reviewed by hand, not machine-verified as "safe" beyond that.
const ALLOWLISTED_PATH_PREFIXES = ['published/']

function isAllowlisted(file) {
  return ALLOWLISTED_PATH_PREFIXES.some((prefix) => file.startsWith(prefix))
}

function trackedFiles() {
  const output = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
  return output.split('\n').filter(Boolean)
}

function isBinary(filePath) {
  try {
    const buffer = fs.readFileSync(filePath)
    return buffer.subarray(0, 8000).includes(0)
  } catch {
    return true
  }
}

function scan() {
  const files = trackedFiles()
  const findings = []

  for (const file of files) {
    if (isBinary(file)) continue
    let content
    try {
      content = fs.readFileSync(file, 'utf8')
    } catch {
      continue
    }

    for (const pattern of PATTERNS) {
      if (pattern.name.startsWith('hex-private-key') && isAllowlisted(file)) {
        continue
      }
      const matches = content.match(pattern.regex)
      if (matches) {
        findings.push({ file, pattern: pattern.name, count: matches.length, sample: matches[0] })
      }
    }
  }

  return findings
}

const findings = scan()

if (findings.length > 0) {
  console.error('Secret scan FAILED — potential secret material in tracked files:\n')
  for (const finding of findings) {
    console.error(`  ${finding.file}: ${finding.pattern} (${finding.count} match(es), e.g. "${finding.sample}")`)
  }
  console.error('\nIf a match is a known-safe public identifier (batch ID, manifest reference), add the file to')
  console.error('ALLOWLISTED_FILES in scripts/secret-scan.mjs with a comment explaining why it is safe.')
  process.exit(1)
}

console.log(`Secret scan passed — ${trackedFiles().length} tracked files checked, no secrets found.`)
