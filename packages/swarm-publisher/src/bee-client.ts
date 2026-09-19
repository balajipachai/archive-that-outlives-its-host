import { Bee } from '@ethersphere/bee-js'

/**
 * The only place a `Bee` instance is constructed on the publisher side.
 * Never attach a default signer here — every canonical write passes its
 * batch ID and signer explicitly at the call site (see FR-01/FR-03), so
 * there is no SDK default to accidentally fall back on.
 */
export function createBeeClient(endpoint: string): Bee {
  if (!endpoint || !/^https?:\/\//.test(endpoint)) {
    throw new Error(`Invalid Bee endpoint "${endpoint}": expected an http(s) URL`)
  }
  return new Bee(endpoint)
}
