import fs from 'node:fs'
import { PrivateKey } from '@ethersphere/bee-js'
import { PublishingKeyUnavailableError } from './types.js'

export interface FeedSigningKey {
  privateKey: PrivateKey
  /** EIP-55 checksummed 0x address — safe to log, display, and commit. */
  ownerAddress: string
}

/**
 * Loads the feed-owner private key from exactly one of two ignored,
 * non-tracked sources: an environment variable, or a local key file whose
 * path is itself only named in an environment variable. Never reads a
 * tracked file. Returns null (not a thrown error) when no key is configured,
 * so read-only callers (recovery, status display) can proceed without one.
 */
export function loadFeedSigningKey(env: NodeJS.ProcessEnv = process.env): FeedSigningKey | null {
  const inline = env.ARCHIVE_FEED_PRIVATE_KEY?.trim()
  const keyFilePath = env.ARCHIVE_FEED_KEY_FILE?.trim()

  let hex: string | null = null

  if (inline) {
    hex = inline
  } else if (keyFilePath) {
    try {
      hex = fs.readFileSync(keyFilePath, 'utf8').trim()
    } catch {
      return null
    }
  }

  if (!hex) {
    return null
  }

  const privateKey = new PrivateKey(hex)
  const ownerAddress = privateKey.publicKey().address().toChecksum()
  return { privateKey, ownerAddress }
}

/** Same as {@link loadFeedSigningKey}, but throws the user-facing message from PRD §4.1a. */
export function requireFeedSigningKey(env?: NodeJS.ProcessEnv): FeedSigningKey {
  const key = loadFeedSigningKey(env)
  if (!key) {
    throw new PublishingKeyUnavailableError()
  }
  return key
}
