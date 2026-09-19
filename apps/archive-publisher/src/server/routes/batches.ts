import { Router } from 'express'
import { createBeeClient, createImmutableBatch } from '@archive/swarm-publisher'
import type { ServerEnv } from '../env.js'
import { requireCsrf, requireOrigin, requireSession } from '../middleware.js'
import type { SessionStore } from '../session-store.js'

/** State-changing: spends BZZ from the node wallet. Protected. */
export function createBatchesRouter(env: ServerEnv, store: SessionStore): Router {
  const router = Router()
  const guard = [requireOrigin(env.allowedOrigins), requireSession(store), requireCsrf()]

  router.post('/api/batches', ...guard, async (req, res) => {
    const { endpoint, amount, depth, label } = req.body ?? {}
    if (!endpoint || !amount || !depth) {
      res.status(400).json({ error: 'missing_params', message: 'endpoint, amount, and depth are required.' })
      return
    }

    try {
      const bee = createBeeClient(endpoint)
      const batchId = await createImmutableBatch(bee, { amount: String(amount), depth: Number(depth), label })
      res.json({ batchId })
    } catch (err) {
      res.status(502).json({ error: 'batch_create_failed', message: err instanceof Error ? err.message : String(err) })
    }
  })

  return router
}
