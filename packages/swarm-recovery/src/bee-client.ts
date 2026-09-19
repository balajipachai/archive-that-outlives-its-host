import { Bee } from '@ethersphere/bee-js'

/**
 * The only place a `Bee` instance is constructed on the recovery side. No
 * signer is ever attached — this app only ever reads.
 */
export function createBeeClient(endpoint: string): Bee {
  if (!endpoint || !/^https?:\/\//.test(endpoint)) {
    throw new Error(`Invalid endpoint "${endpoint}": expected an http(s) URL`)
  }
  return new Bee(endpoint)
}
