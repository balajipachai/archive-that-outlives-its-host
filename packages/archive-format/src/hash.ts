import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'

export { isValidSha256Hex } from './hash-shape.js'

/** Streaming SHA-256 of a file on disk, hex-encoded. Node-only. */
export function sha256File(absolutePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(absolutePath)
    stream.on('error', reject)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

/** SHA-256 of an in-memory buffer, hex-encoded. Isomorphic-safe input type. */
export function sha256Bytes(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex')
}
