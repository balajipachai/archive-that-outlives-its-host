import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const runInitMock = vi.fn()

vi.mock('@archive/swarm-publisher', async () => {
  const actual = await vi.importActual<typeof import('@archive/swarm-publisher')>('@archive/swarm-publisher')
  return {
    ...actual,
    runInit: (...args: unknown[]) => runInitMock(...args),
  }
})

const { createApp } = await import('../../src/server/app.js')
const { loadServerEnv } = await import('../../src/server/env.js')

const ORIGIN = 'http://127.0.0.1:4310'

function testEnv() {
  return loadServerEnv({ PUBLISHER_PORT: '4310', LOCAL_OPERATOR_TOKEN: 'test-operator-token' } as NodeJS.ProcessEnv)
}

async function bootstrapSession(app: ReturnType<typeof createApp>) {
  const res = await request(app).post('/api/session').set('Origin', ORIGIN).send({ token: 'test-operator-token' })
  const setCookie = res.headers['set-cookie']![0]!
  const cookie = setCookie.split(';')[0]!
  const csrfToken = res.body.csrfToken as string
  return { cookie, csrfToken }
}

beforeEach(() => {
  runInitMock.mockReset()
  runInitMock.mockResolvedValue({
    ownerAddress: '0x1234567890123456789012345678901234567890',
    topic: 'spiti-folios-v1',
    feedManifestReference: 'a'.repeat(64),
    archiveAddress: `bzz://${'a'.repeat(64)}/`,
    batchId: 'b'.repeat(64),
    alreadyInitialized: false,
  })
})

describe('POST /api/init — auth gate', () => {
  it('rejects a request with no session', async () => {
    const app = createApp(testEnv())
    const res = await request(app)
      .post('/api/init')
      .set('Origin', ORIGIN)
      .send({ endpoint: 'http://localhost:1633', batchId: 'x'.repeat(64), topic: 'spiti-folios-v1' })

    expect(res.status).toBe(401)
    expect(runInitMock).not.toHaveBeenCalled()
  })

  it('rejects a request from a disallowed Origin, even with a valid session', async () => {
    const app = createApp(testEnv())
    const { cookie, csrfToken } = await bootstrapSession(app)

    const res = await request(app)
      .post('/api/init')
      .set('Origin', 'http://evil.example.com')
      .set('Cookie', cookie)
      .set('x-csrf-token', csrfToken)
      .send({ endpoint: 'http://localhost:1633', batchId: 'x'.repeat(64), topic: 'spiti-folios-v1' })

    expect(res.status).toBe(403)
    expect(res.body.error).toBe('origin_not_allowed')
    expect(runInitMock).not.toHaveBeenCalled()
  })

  it('rejects a request with a valid session but a missing CSRF token', async () => {
    const app = createApp(testEnv())
    const { cookie } = await bootstrapSession(app)

    const res = await request(app)
      .post('/api/init')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({ endpoint: 'http://localhost:1633', batchId: 'x'.repeat(64), topic: 'spiti-folios-v1' })

    expect(res.status).toBe(403)
    expect(res.body.error).toBe('invalid_csrf')
    expect(runInitMock).not.toHaveBeenCalled()
  })

  it('rejects a request with an incorrect CSRF token', async () => {
    const app = createApp(testEnv())
    const { cookie } = await bootstrapSession(app)

    const res = await request(app)
      .post('/api/init')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .set('x-csrf-token', 'wrong-token-wrong-token-wrong-token-wrong-token')
      .send({ endpoint: 'http://localhost:1633', batchId: 'x'.repeat(64), topic: 'spiti-folios-v1' })

    expect(res.status).toBe(403)
    expect(runInitMock).not.toHaveBeenCalled()
  })

  it('succeeds when Origin, session, and CSRF token are all valid', async () => {
    const app = createApp(testEnv())
    const { cookie, csrfToken } = await bootstrapSession(app)

    const res = await request(app)
      .post('/api/init')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .set('x-csrf-token', csrfToken)
      .send({ endpoint: 'http://localhost:1633', batchId: 'x'.repeat(64), topic: 'spiti-folios-v1' })

    expect(res.status).toBe(200)
    expect(res.body.result.archiveAddress).toBe(`bzz://${'a'.repeat(64)}/`)
    expect(runInitMock).toHaveBeenCalledTimes(1)
  })
})

describe('POST /api/session', () => {
  it('rejects an incorrect operator token', async () => {
    const app = createApp(testEnv())
    const res = await request(app).post('/api/session').set('Origin', ORIGIN).send({ token: 'wrong' })
    expect(res.status).toBe(401)
  })

  it('never echoes the raw operator token back to the client', async () => {
    const app = createApp(testEnv())
    const res = await request(app).post('/api/session').set('Origin', ORIGIN).send({ token: 'test-operator-token' })
    expect(res.status).toBe(200)
    expect(JSON.stringify(res.body)).not.toContain('test-operator-token')
    expect(res.headers['set-cookie']![0]).toContain('HttpOnly')
  })
})
