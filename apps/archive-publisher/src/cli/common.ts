import {
  BatchNotImmutableError,
  BatchUnavailableError,
  NodeUnavailableError,
  PublicationRecordMismatchError,
  PublishingKeyUnavailableError,
  UltraLightNodeError,
} from '@archive/swarm-publisher'

/**
 * Maps the app's typed errors to the truthful, distinct messages required by
 * PRD §4.3 / §12 item 5 — one message per real condition, never a generic
 * failure.
 */
export function describePublisherError(err: unknown): string {
  if (err instanceof NodeUnavailableError) {
    return 'Cannot reach this Bee node. Check that Swarm Desktop / Bee is running locally, then retry.'
  }
  if (err instanceof UltraLightNodeError) {
    return `This node can read but cannot publish yet (mode: ${err.beeMode}). Fund/redeem through Swarm Desktop; do not paste a code into this app.`
  }
  if (err instanceof BatchNotImmutableError) {
    return `Batch "${err.batchId}" cannot be used for a preservation release. Select or create an immutable batch.`
  }
  if (err instanceof BatchUnavailableError) {
    return `Batch "${err.batchId}" could not be read from the node: ${err.message}`
  }
  if (err instanceof PublishingKeyUnavailableError) {
    return err.message
  }
  if (err instanceof PublicationRecordMismatchError) {
    return err.message
  }
  if (err instanceof Error) {
    return err.message
  }
  return 'An unknown error occurred.'
}

export function requiredEnvWarning(): string | null {
  if (!process.env.ARCHIVE_FEED_PRIVATE_KEY && !process.env.ARCHIVE_FEED_KEY_FILE) {
    return "The archive's publishing key is unavailable; recovery reading still works."
  }
  return null
}
