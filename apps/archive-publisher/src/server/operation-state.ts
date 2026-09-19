import type { PublisherState } from '@archive/swarm-publisher'

/**
 * The publish flow can take a while (uploading a real collection, then
 * advancing the feed). This module holds the most recent state so the UI
 * can poll `GET /api/publish/progress` while the state-changing
 * `POST /api/publish` request is still in flight — both are served by the
 * same Node process, so the event loop interleaves them across awaits.
 */
let current: PublisherState | null = null

export function setOperationState(state: PublisherState): void {
  current = state
}

export function getOperationState(): PublisherState | null {
  return current
}

export function resetOperationState(): void {
  current = null
}
