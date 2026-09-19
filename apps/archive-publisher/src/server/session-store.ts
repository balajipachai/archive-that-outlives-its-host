import { randomBytes, timingSafeEqual } from 'node:crypto'

export interface Session {
  id: string
  csrfToken: string
  createdAt: number
}

/**
 * In-memory session store for a single local operator. There is exactly one
 * process, one operator, and sessions do not need to survive a restart —
 * losing them just means re-entering the bootstrap token.
 */
export class SessionStore {
  private readonly sessions = new Map<string, Session>()

  create(): Session {
    const session: Session = {
      id: randomBytes(32).toString('hex'),
      csrfToken: randomBytes(32).toString('hex'),
      createdAt: Date.now(),
    }
    this.sessions.set(session.id, session)
    return session
  }

  get(sessionId: string | undefined): Session | null {
    if (!sessionId) return null
    return this.sessions.get(sessionId) ?? null
  }

  destroy(sessionId: string): void {
    this.sessions.delete(sessionId)
  }
}

export function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}
