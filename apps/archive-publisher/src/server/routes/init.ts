import { Router } from 'express'
import { runInit } from '@archive/swarm-publisher'
import type { ServerEnv } from '../env.js'
import { requireCsrf, requireOrigin, requireSession } from '../middleware.js'
import type { SessionStore } from '../session-store.js'
import { describeApiError } from '../error-mapping.js'

/** State-changing: creates the one feed manifest and writes the public record. Protected. */
export function createInitRouter(env: ServerEnv, store: SessionStore): Router {
  const router = Router()
  const guard = [requireOrigin(env.allowedOrigins), requireSession(store), requireCsrf()]

  router.post('/api/init', ...guard, async (req, res) => {
    const { endpoint, batchId, topic } = req.body ?? {}
    if (!endpoint || !batchId || !topic) {
      res.status(400).json({ error: 'missing_params', message: 'endpoint, batchId, and topic are required.' })
      return
    }

    try {
      const result = await runInit({ endpoint, batchId, topic })
      res.json({ result })
    } catch (err) {
      const mapped = describeApiError(err)
      res.status(mapped.status).json({ error: mapped.code, message: mapped.message })
    }
  })

  return router
}
