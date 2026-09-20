import { existsSync } from 'node:fs'
import path from 'node:path'

/**
 * Side-effect import: loads `.env` from the current working directory into
 * `process.env`, if present. Real environment variables the shell already
 * set are never overwritten. Every CLI entrypoint and the server import
 * this first, so `.env` (never committed) is the one place an operator
 * needs to put ARCHIVE_FEED_PRIVATE_KEY / LOCAL_OPERATOR_TOKEN / etc.
 *
 * Uses Node's built-in `process.loadEnvFile` (available since the Node
 * 20.12 this repo already requires) instead of adding a `dotenv` dependency.
 */
const envPath = path.resolve(process.cwd(), '.env')

if (existsSync(envPath)) {
  process.loadEnvFile(envPath)
}
