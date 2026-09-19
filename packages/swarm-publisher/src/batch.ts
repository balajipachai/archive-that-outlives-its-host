import type { Bee, PostageBatch } from '@ethersphere/bee-js'

export interface CreateImmutableBatchOptions {
  /** TTL parameter — see bee-js `stamp.create` docs for the amount/duration relationship. */
  amount: string
  /** Capacity parameter, 17..255. */
  depth: number
  label?: string
}

/**
 * Creates a new postage batch with `immutableFlag: true`. This is the only
 * batch-creation path the app exposes for canonical releases — there is no
 * "create a mutable batch" action in the publish flow.
 */
export async function createImmutableBatch(bee: Bee, options: CreateImmutableBatchOptions): Promise<string> {
  const batchId = await bee.stamp.create(options.amount, options.depth, {
    immutableFlag: true,
    waitForUsable: true,
    ...(options.label ? { label: options.label } : {}),
  })
  return batchId.toHex()
}

export async function listBatches(bee: Bee): Promise<PostageBatch[]> {
  return bee.stamp.getAll()
}
