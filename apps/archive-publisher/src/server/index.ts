import '../load-env.js'
import { createApp } from './app.js'
import { loadServerEnv } from './env.js'

const env = loadServerEnv()

if (!env.operatorToken) {
  console.error('LOCAL_OPERATOR_TOKEN is not set. Generate one (e.g. `openssl rand -hex 32`) and set it in your local .env.')
  process.exit(1)
}

const app = createApp(env)

// Loopback only — never 0.0.0.0. This must never become a public upload
// service (PRD §1 "out of scope").
app.listen(env.port, '127.0.0.1', () => {
  console.log(`archive-publisher server listening on http://127.0.0.1:${env.port}`)
})
