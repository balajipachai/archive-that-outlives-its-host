#!/usr/bin/env node
import path from 'node:path'
import { Command } from 'commander'
import {
  EndpointUnreachableError,
  HashMismatchError,
  InvalidRecoveryInputError,
  MalformedManifestError,
  MissingFileError,
  NoReleasePublishedError,
  recover,
  type RecoverOptions,
  type RecoveryResult,
} from '@archive/swarm-recovery/node'

export function describeRecoveryError(err: unknown): string {
  if (err instanceof NoReleasePublishedError) {
    return 'No release has been published yet at this address.'
  }
  if (err instanceof EndpointUnreachableError) {
    return `Cannot reach the endpoint. Check that a Bee node or content gateway is running and reachable: ${err.message}`
  }
  if (err instanceof InvalidRecoveryInputError) {
    return `Invalid input: ${err.message}`
  }
  if (err instanceof MalformedManifestError) {
    return `The release manifest is malformed: ${err.message}`
  }
  if (err instanceof MissingFileError) {
    return `A required file is missing from the collection: ${err.path}`
  }
  if (err instanceof HashMismatchError) {
    return `Hash mismatch — the downloaded content does not match the published manifest: ${err.path}`
  }
  if (err instanceof Error) {
    return `Recovery failed: ${err.message}`
  }
  return 'Recovery failed with an unknown error.'
}

export function formatSuccessReport(result: RecoveryResult): string {
  const lines: string[] = []
  lines.push(`Recovered "${result.title}" (release ${result.releaseId}, published ${result.publishedAt})`)
  lines.push(`Resolved via: ${result.resolved.normalizedInput}`)
  lines.push(`Collection reference: ${result.resolved.addressReference}`)
  if (result.resolved.feedIndex !== null) {
    lines.push(`Feed index: ${result.resolved.feedIndex}`)
  }
  lines.push('')
  lines.push('Files:')
  for (const file of result.files) {
    lines.push(`  ✓ ${file.path} (${file.sizeBytes} bytes, sha256 verified)`)
  }
  lines.push('')
  lines.push(`All ${result.files.length} file(s) verified and written to: ${result.outputDir}`)
  return lines.join('\n')
}

export type RecoverFn = (options: RecoverOptions) => Promise<RecoveryResult>

/**
 * `pnpm archive:recover --manifest <feed-manifest-ref> --endpoint <bee-or-gateway-endpoint> --out <dir>`
 * `pnpm archive:recover --owner <0x-address> --topic <topic> --endpoint <bee-or-gateway-endpoint> --out <dir>`
 *
 * The only inputs are public identifiers, a Bee/content endpoint, and an
 * output directory. This binary imports nothing from the publisher app,
 * `@archive/swarm-publisher`, or any local state file — see
 * `test/import-boundary.test.ts`.
 */
export function buildProgram(recoverFn: RecoverFn = recover): Command {
  const program = new Command()

  program
    .name('archive-recover')
    .description('Recover the archive from public identifiers alone: a feed manifest reference, or an owner + topic pair.')
    .option('--manifest <reference>', 'feed manifest reference, or the bzz://<ref>/ address shown by the publisher')
    .option('--owner <address>', '0x public feed-owner address (use with --topic)')
    .option('--topic <topic>', 'public feed topic (use with --owner)')
    .requiredOption('--endpoint <url>', 'Bee or content-gateway HTTP endpoint, e.g. http://localhost:1633')
    .requiredOption('--out <dir>', 'output directory to write recovered files into')
    .action(async (opts) => {
      const outputDir = path.resolve(opts.out)

      try {
        const result = await recoverFn({
          manifest: opts.manifest,
          owner: opts.owner,
          topic: opts.topic,
          endpoint: opts.endpoint,
          outputDir,
          onProgress: ({ path: filePath, index, total }) => {
            process.stdout.write(`[${index + 1}/${total}] downloading and verifying ${filePath}\n`)
          },
        })

        console.log('')
        console.log(formatSuccessReport(result))
        process.exitCode = 0
      } catch (err) {
        console.error('')
        console.error(describeRecoveryError(err))
        process.exitCode = 1
      }
    })

  return program
}

const isMainModule = process.argv[1] && import.meta.url === `file://${process.argv[1]}`
if (isMainModule) {
  void buildProgram().parseAsync(process.argv)
}
