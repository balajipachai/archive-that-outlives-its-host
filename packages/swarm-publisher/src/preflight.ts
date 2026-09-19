import type { Bee } from '@ethersphere/bee-js'
import {
  BatchNotImmutableError,
  BatchUnavailableError,
  NodeUnavailableError,
  UltraLightNodeError,
  type BatchHealth,
  type PublisherState,
} from './types.js'

export interface PreflightOptions {
  batchId: string
  warningThresholdDays?: number
}

const DEFAULT_WARNING_THRESHOLD_DAYS = 14

/**
 * Confirms the node answers at all. Node reachability is checked first and
 * separately from mode/batch checks so "node unavailable" is never confused
 * with "node reachable but unfunded".
 */
export async function assertNodeReachable(bee: Bee): Promise<void> {
  try {
    await bee.status.getHealth()
  } catch (err) {
    throw new NodeUnavailableError(err)
  }
}

/**
 * Confirms the node is in a mode that can upload at all. A fresh node in
 * `ultra-light` mode can only download — it has no chequebook/postage
 * capability — so we surface that distinctly rather than letting an upload
 * attempt fail with a confusing low-level error.
 */
export async function assertNodeCanPublish(bee: Bee): Promise<void> {
  const info = await bee.status.getNodeInfo()
  if (info.beeMode === 'ultra-light') {
    throw new UltraLightNodeError(info.beeMode)
  }
}

/**
 * Reads the live, node-reported batch health, including the
 * `immutableFlag` this app requires for any canonical write. This is the
 * one function that answers "how long is this paid for" (AC-06 / FR-05) —
 * it always returns the raw observed duration, never an invented estimate.
 */
export async function readBatchHealth(
  bee: Bee,
  options: PreflightOptions,
): Promise<BatchHealth> {
  const warningThresholdDays = options.warningThresholdDays ?? DEFAULT_WARNING_THRESHOLD_DAYS

  let batch
  try {
    batch = await bee.stamp.get(options.batchId)
  } catch (err) {
    throw new BatchUnavailableError(options.batchId, err)
  }

  const durationSeconds = batch.duration.toSeconds()
  const warning = durationSeconds / 86_400 < warningThresholdDays

  return {
    batchId: options.batchId,
    usable: batch.usable,
    immutableFlag: batch.immutableFlag,
    utilization: batch.utilization,
    durationSeconds,
    observedAt: new Date().toISOString(),
    warning,
    warningThresholdDays,
  }
}

/**
 * Blocks canonical (preservation) publishing when the selected batch is not
 * immutable. This is a storage invariant, not UI copy — every canonical
 * write path calls this before touching the network.
 */
export function assertBatchIsImmutable(batch: BatchHealth): void {
  if (!batch.immutableFlag) {
    throw new BatchNotImmutableError(batch.batchId)
  }
}

/**
 * Runs the full preflight sequence and returns the PRD §4.3 state that best
 * describes the node right now. Never throws for an expected condition —
 * every branch below is a named, user-facing state.
 */
export async function runPreflight(bee: Bee, options: PreflightOptions): Promise<PublisherState> {
  try {
    await assertNodeReachable(bee)
  } catch (err) {
    if (err instanceof NodeUnavailableError) {
      return { kind: 'node-unavailable', detail: err.message }
    }
    throw err
  }

  try {
    await assertNodeCanPublish(bee)
  } catch (err) {
    if (err instanceof UltraLightNodeError) {
      return { kind: 'ultra-light-or-unfunded', detail: err.message, beeMode: err.beeMode }
    }
    throw err
  }

  const batch = await readBatchHealth(bee, options)

  if (!batch.immutableFlag) {
    return { kind: 'batch-not-immutable', detail: 'This batch cannot be used for a preservation release', batchId: batch.batchId }
  }

  if (batch.warning) {
    return { kind: 'batch-warning', batch }
  }

  return { kind: 'ready', batch }
}
