import { describe, expect, it } from 'vitest'
import { Duration } from '@ethersphere/bee-js'
import {
  assertBatchIsImmutable,
  readBatchHealth,
  runPreflight,
} from '../src/preflight.js'
import { BatchNotImmutableError } from '../src/types.js'

function makeMockBee(overrides: {
  health?: () => Promise<unknown>
  nodeInfo?: () => Promise<{ beeMode: string }>
  stampGet?: () => Promise<any>
}) {
  return {
    status: {
      getHealth: overrides.health ?? (async () => ({ status: 'ok' })),
      getNodeInfo: overrides.nodeInfo ?? (async () => ({ beeMode: 'light' })),
    },
    stamp: {
      get: overrides.stampGet ?? (async () => ({ immutableFlag: true, usable: true, utilization: 0.1, duration: Duration.fromDays(30) })),
    },
  } as any
}

describe('runPreflight', () => {
  it('reports node-unavailable when health check fails', async () => {
    const bee = makeMockBee({ health: async () => { throw new Error('ECONNREFUSED') } })
    const state = await runPreflight(bee, { batchId: 'batch-1' })
    expect(state.kind).toBe('node-unavailable')
  })

  it('reports ultra-light-or-unfunded for an ultra-light node', async () => {
    const bee = makeMockBee({ nodeInfo: async () => ({ beeMode: 'ultra-light' }) })
    const state = await runPreflight(bee, { batchId: 'batch-1' })
    expect(state.kind).toBe('ultra-light-or-unfunded')
  })

  it('reports batch-not-immutable when the batch lacks the immutable flag', async () => {
    const bee = makeMockBee({
      stampGet: async () => ({ immutableFlag: false, usable: true, utilization: 0.1, duration: Duration.fromDays(30) }),
    })
    const state = await runPreflight(bee, { batchId: 'batch-1' })
    expect(state.kind).toBe('batch-not-immutable')
  })

  it('reports batch-warning when remaining duration is below the threshold', async () => {
    const bee = makeMockBee({
      stampGet: async () => ({ immutableFlag: true, usable: true, utilization: 0.1, duration: Duration.fromDays(2) }),
    })
    const state = await runPreflight(bee, { batchId: 'batch-1', warningThresholdDays: 14 })
    expect(state.kind).toBe('batch-warning')
  })

  it('reports ready for a healthy, funded, immutable, well-funded batch', async () => {
    const bee = makeMockBee({})
    const state = await runPreflight(bee, { batchId: 'batch-1', warningThresholdDays: 14 })
    expect(state.kind).toBe('ready')
  })
})

describe('assertBatchIsImmutable', () => {
  it('throws BatchNotImmutableError for a mutable batch', async () => {
    const health = await readBatchHealth(
      makeMockBee({ stampGet: async () => ({ immutableFlag: false, usable: true, utilization: 0, duration: Duration.fromDays(1) }) }),
      { batchId: 'mutable-batch' },
    )
    expect(() => assertBatchIsImmutable(health)).toThrow(BatchNotImmutableError)
  })

  it('does not throw for an immutable batch', async () => {
    const health = await readBatchHealth(makeMockBee({}), { batchId: 'immutable-batch' })
    expect(() => assertBatchIsImmutable(health)).not.toThrow()
  })
})

describe('readBatchHealth', () => {
  it('surfaces the raw node-reported duration in seconds, never a hardcoded estimate', async () => {
    const thirtyDaysInSeconds = 30 * 86_400
    const bee = makeMockBee({
      stampGet: async () => ({ immutableFlag: true, usable: true, utilization: 0.5, duration: Duration.fromDays(30) }),
    })
    const health = await readBatchHealth(bee, { batchId: 'batch-1' })
    expect(health.durationSeconds).toBe(thirtyDaysInSeconds)
    expect(health.observedAt).toBeTruthy()
  })
})
