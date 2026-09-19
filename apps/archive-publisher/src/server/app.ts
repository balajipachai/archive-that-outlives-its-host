import express, { type Express } from 'express'
import type { ServerEnv } from './env.js'
import { createBatchesRouter } from './routes/batches.js'
import { createInitRouter } from './routes/init.js'
import { createPublishRouter } from './routes/publish.js'
import { createRecoverTestRouter } from './routes/recover-test.js'
import { createSessionRouter } from './routes/session.js'
import { createStatusRouter } from './routes/status.js'
import { SessionStore } from './session-store.js'

export function createApp(env: ServerEnv, store: SessionStore = new SessionStore()): Express {
  const app = express()
  app.use(express.json())

  app.get('/healthz', (_req, res) => res.json({ ok: true }))

  app.use(createSessionRouter(env, store))
  app.use(createStatusRouter(env))
  app.use(createRecoverTestRouter())
  app.use(createBatchesRouter(env, store))
  app.use(createInitRouter(env, store))
  app.use(createPublishRouter(env, store))

  return app
}
