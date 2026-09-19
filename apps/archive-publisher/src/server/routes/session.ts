import { serialize as serializeCookie } from 'cookie'
import { Router } from 'express'
import type { ServerEnv } from '../env.js'
import { SESSION_COOKIE_NAME } from '../middleware.js'
import { constantTimeEquals, type SessionStore } from '../session-store.js'

/**
 * The operator enters the local token once into a bootstrap form; the
 * server compares it and creates an HttpOnly/SameSite=Strict session. The
 * raw token is never sent back to the browser (PRD §10).
 */
export function createSessionRouter(env: ServerEnv, store: SessionStore): Router {
  const router = Router()

  router.post('/api/session', (req, res) => {
    if (!env.operatorToken) {
      res.status(503).json({ error: 'operator_token_not_configured', message: 'LOCAL_OPERATOR_TOKEN is not set on the server.' })
      return
    }

    const origin = req.headers.origin
    if (!origin || !env.allowedOrigins.includes(origin)) {
      res.status(403).json({ error: 'origin_not_allowed' })
      return
    }

    const provided = typeof req.body?.token === 'string' ? req.body.token : ''
    if (!provided || !constantTimeEquals(provided, env.operatorToken)) {
      res.status(401).json({ error: 'invalid_token', message: 'Incorrect operator token.' })
      return
    }

    const session = store.create()
    res.setHeader(
      'Set-Cookie',
      serializeCookie(SESSION_COOKIE_NAME, session.id, {
        httpOnly: true,
        sameSite: 'strict',
        path: '/',
      }),
    )
    res.json({ csrfToken: session.csrfToken })
  })

  return router
}
