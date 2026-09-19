import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const runPreflightMock = vi.fn()

vi.mock('@archive/swarm-publisher', async () => {
  const actual = await vi.importActual<typeof import('@archive/swarm-publisher')>('@archive/swarm-publisher')
  return {
    ...actual,
    runPreflight: (...args: unknown[]) => runPreflightMock(...args),
  }
})

const { createApp } = await import('../../src/server/app.js')
const { loadServerEnv } = await import('../../src/server/env.js')

beforeEach(() => {
  runPreflightMock.mockReset()
})

describe('GET /api/status — read-only, credential-free', () => {
  it('returns the preflight state with no session, Origin, or CSRF token at all', async () => {
    runPreflightMock.mockResolvedValue({ kind: 'node-unavailable', detail: 'Cannot reach this Bee node' })
    const app = createApp(loadServerEnv({ PUBLISHER_PORT: '4310', LOCAL_OPERATOR_TOKEN: 'x' } as NodeJS.ProcessEnv))

    const res = await request(app).get('/api/status').query({ endpoint: 'http://localhost:1633', batchId: 'a'.repeat(64) })

    expect(res.status).toBe(200)
    expect(res.body.state.kind).toBe('node-unavailable')
  })

  it('requires endpoint and batchId query params', async () => {
    const app = createApp(loadServerEnv({ PUBLISHER_PORT: '4310', LOCAL_OPERATOR_TOKEN: 'x' } as NodeJS.ProcessEnv))
    const res = await request(app).get('/api/status')
    expect(res.status).toBe(400)
  })
})

describe('GET /api/publication-record', () => {
  it('responds without requiring a session', async () => {
    const app = createApp(loadServerEnv({ PUBLISHER_PORT: '4310', LOCAL_OPERATOR_TOKEN: 'x' } as NodeJS.ProcessEnv))
    const res = await request(app).get('/api/publication-record')
    expect(res.status).toBe(200)
    expect('record' in res.body).toBe(true)
  })
})
