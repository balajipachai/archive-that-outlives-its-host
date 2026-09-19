import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Router } from 'express'
import { recover } from '@archive/swarm-recovery/node'

/**
 * "Test independent recovery" — runs the exact same standalone recovery
 * path a stranger would use, into a throwaway temp directory, using only
 * public identifiers. Read-only against the network, so it is credential-
 * free like every other status/recovery route (PRD §10).
 */
export function createRecoverTestRouter(): Router {
  const router = Router()

  router.get('/api/recover-test', async (req, res) => {
    const endpoint = String(req.query.endpoint ?? '')
    const manifest = typeof req.query.manifest === 'string' ? req.query.manifest : undefined
    const owner = typeof req.query.owner === 'string' ? req.query.owner : undefined
    const topic = typeof req.query.topic === 'string' ? req.query.topic : undefined

    if (!endpoint || (!manifest && !(owner && topic))) {
      res.status(400).json({ error: 'missing_params', message: 'endpoint and (manifest or owner+topic) are required.' })
      return
    }

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'archive-recover-test-'))
    try {
      const result = await recover({ manifest, owner, topic, endpoint, outputDir: tempDir })
      res.json({
        ok: true,
        releaseId: result.releaseId,
        title: result.title,
        fileCount: result.files.length,
        resolved: result.resolved,
      })
    } catch (err) {
      res.status(502).json({ ok: false, message: err instanceof Error ? err.message : String(err) })
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  return router
}
