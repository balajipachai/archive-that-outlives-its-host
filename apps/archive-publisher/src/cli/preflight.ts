#!/usr/bin/env node
import { Command } from 'commander'
import { createBeeClient, runPreflight } from '@archive/swarm-publisher'
import { describePublisherError } from './common.js'

/** `pnpm archive:preflight --endpoint <bee-endpoint> --batch-id <existing-batch-id>` */
const program = new Command()

program
  .requiredOption('--endpoint <url>', 'Bee node HTTP API, e.g. http://localhost:1633')
  .requiredOption('--batch-id <id>', 'existing postage batch ID to check')
  .option('--warning-threshold-days <n>', 'days of remaining duration below which storage is flagged', (v) => Number(v), 14)
  .action(async (opts) => {
    try {
      const bee = createBeeClient(opts.endpoint)
      const state = await runPreflight(bee, { batchId: opts.batchId, warningThresholdDays: opts.warningThresholdDays })

      console.log(`Endpoint: ${opts.endpoint}`)
      console.log(`Batch:    ${opts.batchId}`)
      console.log('')

      switch (state.kind) {
        case 'node-unavailable':
          console.log('Status: Cannot reach this Bee node')
          process.exitCode = 1
          break
        case 'ultra-light-or-unfunded':
          console.log(`Status: This node can read but cannot publish yet (mode: ${state.beeMode})`)
          process.exitCode = 1
          break
        case 'batch-not-immutable':
          console.log('Status: This batch cannot be used for a preservation release (immutableFlag is not true)')
          process.exitCode = 1
          break
        case 'batch-warning':
          console.log('Status: Storage payment needs attention')
          printBatch(state.batch)
          process.exitCode = 0
          break
        case 'ready':
          console.log('Status: Ready to publish')
          printBatch(state.batch)
          process.exitCode = 0
          break
        default:
          console.log(`Status: ${state.kind}`)
      }
    } catch (err) {
      console.error(describePublisherError(err))
      process.exitCode = 1
    }
  })

function printBatch(batch: { batchId: string; usable: boolean; immutableFlag: boolean; utilization: number; durationSeconds: number; warning: boolean; warningThresholdDays: number; observedAt: string }) {
  const days = (batch.durationSeconds / 86_400).toFixed(1)
  console.log(`  usable:        ${batch.usable}`)
  console.log(`  immutableFlag: ${batch.immutableFlag}`)
  console.log(`  utilization:   ${batch.utilization}`)
  console.log(`  duration:      ${batch.durationSeconds}s (~${days} days), observed at ${batch.observedAt}`)
  console.log(`  warning:       ${batch.warning} (threshold: ${batch.warningThresholdDays} days)`)
}

void program.parseAsync(process.argv)
