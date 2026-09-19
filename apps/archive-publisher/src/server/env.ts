export interface ServerEnv {
  port: number
  operatorToken: string | null
  batchWarningThresholdDays: number
  allowedOrigins: string[]
}

/** Vite's dev server (5173) and preview server (4173) run on loopback too. */
const DEV_UI_PORTS = [5173, 4173]

export function loadServerEnv(env: NodeJS.ProcessEnv = process.env): ServerEnv {
  const port = Number(env.PUBLISHER_PORT ?? 4310)

  if (env.PUBLISHER_ALLOWED_ORIGINS) {
    return {
      port,
      operatorToken: env.LOCAL_OPERATOR_TOKEN?.trim() || null,
      batchWarningThresholdDays: Number(env.BATCH_WARNING_THRESHOLD_DAYS ?? 14),
      allowedOrigins: env.PUBLISHER_ALLOWED_ORIGINS.split(',').map((o) => o.trim()),
    }
  }

  const ports = [port, ...DEV_UI_PORTS]
  const allowedOrigins = ports.flatMap((p) => [`http://127.0.0.1:${p}`, `http://localhost:${p}`])

  return {
    port,
    operatorToken: env.LOCAL_OPERATOR_TOKEN?.trim() || null,
    batchWarningThresholdDays: Number(env.BATCH_WARNING_THRESHOLD_DAYS ?? 14),
    allowedOrigins,
  }
}
