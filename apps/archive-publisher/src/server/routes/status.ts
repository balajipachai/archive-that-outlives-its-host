import { Router } from 'express'
import {
  createBeeClient,
  listBatches,
  publicationRecordPath,
  readPublicationRecord,
  runPreflight,
} from '@archive/swarm-publisher'
import type { ServerEnv } from '../env.js'

/**
 * Read-only routes. No session/CSRF/Origin gate — PRD §10: "Read-only
 * status/recovery routes remain credential-free."
 */
export function createStatusRouter(env: ServerEnv): Router {
  const router = Router()

  router.get('/api/status', async (req, res) => {
    const endpoint = String(req.query.endpoint ?? '')
    const batchId = String(req.query.batchId ?? '')

    if (!endpoint || !batchId) {
      res.status(400).json({ error: 'missing_params', message: 'endpoint and batchId are required.' })
      return
    }

    try {
      const bee = createBeeClient(endpoint)
      const state = await runPreflight(bee, { batchId, warningThresholdDays: env.batchWarningThresholdDays })
      res.json({ state })
    } catch (err) {
      res.status(502).json({ error: 'preflight_failed', message: err instanceof Error ? err.message : String(err) })
    }
  })

  router.get('/api/batches', async (req, res) => {
    const endpoint = String(req.query.endpoint ?? '')
    if (!endpoint) {
      res.status(400).json({ error: 'missing_params', message: 'endpoint is required.' })
      return
    }

    try {
      const bee = createBeeClient(endpoint)
      const batches = await listBatches(bee)
      res.json({
        batches: batches.map((b) => ({
          batchId: b.batchID.toHex(),
          usable: b.usable,
          immutableFlag: b.immutableFlag,
          utilization: b.utilization,
          durationSeconds: b.duration.toSeconds(),
          label: b.label,
        })),
      })
    } catch (err) {
      res.status(502).json({ error: 'batches_failed', message: err instanceof Error ? err.message : String(err) })
    }
  })

  router.get('/api/publication-record', async (_req, res) => {
    const record = await readPublicationRecord(publicationRecordPath())
    res.json({ record })
  })

  return router
}
