#!/usr/bin/env node
import '../load-env.js'
import { Command } from 'commander'
import { runPublish, UploadedNotPublishedError } from '@archive/swarm-publisher'
import { describePublisherError } from './common.js'

/** `pnpm archive:publish --input <directory> --endpoint <bee-endpoint> --batch-id <existing-batch-id>` */
const program = new Command()

program
  .requiredOption('--input <directory>', 'directory containing the files to publish')
  .requiredOption('--endpoint <url>', 'Bee node HTTP API, e.g. http://localhost:1633')
  .requiredOption('--batch-id <id>', 'existing, immutable postage batch ID for this release')
  .option('--title <title>', 'release title', 'Untitled release')
  .option('--release-id <id>', 'override the generated release ID (advanced/testing use)')
  .action(async (opts) => {
    try {
      const result = await runPublish(
        { endpoint: opts.endpoint, batchId: opts.batchId, input: opts.input, title: opts.title, releaseId: opts.releaseId },
        process.env,
        {
          onState: (state) => {
            if (state.kind === 'uploading-release') console.log('Uploading immutable release…')
            if (state.kind === 'advancing-feed') console.log('Updating the stable archive address…')
            if (state.kind === 'verifying') console.log('Checking the public recovery path…')
          },
        },
      )

      console.log('')
      console.log('Published and recoverable.')
      console.log('')
      console.log(`Release ID:             ${result.releaseId}`)
      console.log(`Files:                  ${result.fileCount} (${result.totalSizeBytes} bytes)`)
      console.log(`Collection reference:   ${result.collectionReference}`)
      console.log(`Feed index:             ${result.feedIndex}`)
      console.log(`Stable archive address: ${result.archiveAddress}`)
      console.log(`Owner / topic:          ${result.owner} / ${result.topic}`)
      process.exitCode = 0
    } catch (err) {
      if (err instanceof UploadedNotPublishedError) {
        console.error('Release uploaded, but the public address still points to the previous release.')
        console.error(`Collection reference (retry feed advancement with this): ${err.collectionReference}`)
      } else {
        console.error(describePublisherError(err))
      }
      process.exitCode = 1
    }
  })

void program.parseAsync(process.argv)
