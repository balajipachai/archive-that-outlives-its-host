#!/usr/bin/env node
import '../load-env.js'
import { Command } from 'commander'
import { runInit } from '@archive/swarm-publisher'
import { describePublisherError } from './common.js'

/** `pnpm archive:init --topic <human-readable-topic> --endpoint <bee-endpoint> --batch-id <existing-batch-id>` */
const program = new Command()

program
  .requiredOption('--topic <topic>', 'human-readable feed topic, e.g. master-of-all')
  .requiredOption('--endpoint <url>', 'Bee node HTTP API, e.g. http://localhost:1633')
  .requiredOption('--batch-id <id>', 'existing postage batch ID to create the feed manifest with')
  .action(async (opts) => {
    try {
      const result = await runInit({ endpoint: opts.endpoint, batchId: opts.batchId, topic: opts.topic })

      if (result.alreadyInitialized) {
        console.log('An existing publication record already matches this key and topic — nothing to do.')
      } else {
        console.log('Feed manifest created.')
      }
      console.log('')
      console.log(`Owner:                 ${result.ownerAddress}`)
      console.log(`Topic:                 ${result.topic}`)
      console.log(`Feed manifest ref:     ${result.feedManifestReference}`)
      console.log(`Stable archive address: ${result.archiveAddress}`)
      console.log('')
      if (!result.alreadyInitialized) {
        console.log('published/archive-publication.json has been written with these real, public values.')
        console.log('Review it, then commit it — it contains no private key or authenticated endpoint.')
      }
      process.exitCode = 0
    } catch (err) {
      console.error(describePublisherError(err))
      process.exitCode = 1
    }
  })

void program.parseAsync(process.argv)
