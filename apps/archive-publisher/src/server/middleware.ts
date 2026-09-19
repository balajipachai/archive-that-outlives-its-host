import { parse as parseCookieHeader } from 'cookie'
import type { NextFunction, Request, Response } from 'express'
import { constantTimeEquals, type Session, type SessionStore } from './session-store.js'

export const SESSION_COOKIE_NAME = 'archive_publisher_session'
export const CSRF_HEADER_NAME = 'x-csrf-token'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- the standard Express Request augmentation pattern
  namespace Express {
    interface Request {
      operatorSession?: Session
    }
  }
}

export function readSessionIdFromRequest(req: Request): string | undefined {
  const header = req.headers.cookie
  if (!header) return undefined
  const parsed = parseCookieHeader(header)
  return parsed[SESSION_COOKIE_NAME]
}

/**
 * Every state-changing route requires an allowed loopback Origin, a valid
 * session, and a CSRF token (PRD §10). Read-only status/recovery routes
 * never use this middleware.
 */
export function requireOrigin(allowedOrigins: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin
    if (!origin || !allowedOrigins.includes(origin)) {
      res.status(403).json({ error: 'origin_not_allowed', message: 'Request Origin is missing or not an allowed loopback origin.' })
      return
    }
    next()
  }
}

export function requireSession(store: SessionStore) {
  return (req: Request, res: Response, next: NextFunction) => {
    const sessionId = readSessionIdFromRequest(req)
    const session = store.get(sessionId)
    if (!session) {
      res.status(401).json({ error: 'no_session', message: 'Missing or invalid local session. Bootstrap with the operator token first.' })
      return
    }
    req.operatorSession = session
    next()
  }
}

export function requireCsrf() {
  return (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers[CSRF_HEADER_NAME]
    const provided = Array.isArray(header) ? header[0] : header
    const session = req.operatorSession

    if (!provided || !session || !constantTimeEquals(provided, session.csrfToken)) {
      res.status(403).json({ error: 'invalid_csrf', message: 'Missing or invalid CSRF token.' })
      return
    }
    next()
  }
}
