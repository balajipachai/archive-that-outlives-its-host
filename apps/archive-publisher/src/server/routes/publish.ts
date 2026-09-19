import { Router } from 'express'
import { runPublish } from '@archive/swarm-publisher'
import type { ServerEnv } from '../env.js'
import { describeApiError } from '../error-mapping.js'
import { requireCsrf, requireOrigin, requireSession } from '../middleware.js'
import { getOperationState, setOperationState } from '../operation-state.js'
import type { SessionStore } from '../session-store.js'

export function createPublishRouter(env: ServerEnv, store: SessionStore): Router {
  const router = Router()
  const guard = [requireOrigin(env.allowedOrigins), requireSession(store), requireCsrf()]

  // Read-only: the UI polls this while POST /api/publish is in flight.
  router.get('/api/publish/progress', (_req, res) => {
    res.json({ state: getOperationState() })
  })

  router.post('/api/publish', ...guard, async (req, res) => {
    const { endpoint, batchId, input, title } = req.body ?? {}
    if (!endpoint || !batchId || !input || !title) {
      res.status(400).json({ error: 'missing_params', message: 'endpoint, batchId, input, and title are required.' })
      return
    }

    try {
      const result = await runPublish({ endpoint, batchId, input, title }, process.env, {
        onState: (state) => setOperationState(state),
      })
      res.json({ result })
    } catch (err) {
      const mapped = describeApiError(err)
      res.status(mapped.status).json({ error: mapped.code, message: mapped.message, ...mapped.extra })
    }
  })

  return router
}
