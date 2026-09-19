import {
  BatchNotImmutableError,
  BatchUnavailableError,
  NodeUnavailableError,
  NoPublicationRecordError,
  PublicationRecordMismatchError,
  PublishingKeyUnavailableError,
  UltraLightNodeError,
  UploadedNotPublishedError,
} from '@archive/swarm-publisher'

export interface ApiErrorShape {
  status: number
  code: string
  message: string
  extra?: Record<string, unknown>
}

/** One truthful, distinct message per real condition (PRD §4.3 / §12 item 5). */
export function describeApiError(err: unknown): ApiErrorShape {
  if (err instanceof NodeUnavailableError) {
    return { status: 503, code: 'node_unavailable', message: 'Cannot reach this Bee node' }
  }
  if (err instanceof UltraLightNodeError) {
    return { status: 409, code: 'ultra_light_or_unfunded', message: 'This node can read but cannot publish yet', extra: { beeMode: err.beeMode } }
  }
  if (err instanceof BatchNotImmutableError) {
    return { status: 409, code: 'batch_not_immutable', message: 'This batch cannot be used for a preservation release', extra: { batchId: err.batchId } }
  }
  if (err instanceof BatchUnavailableError) {
    return { status: 502, code: 'batch_unavailable', message: err.message, extra: { batchId: err.batchId } }
  }
  if (err instanceof PublishingKeyUnavailableError) {
    return { status: 409, code: 'key_unavailable', message: err.message }
  }
  if (err instanceof PublicationRecordMismatchError) {
    return { status: 409, code: 'record_mismatch', message: err.message }
  }
  if (err instanceof NoPublicationRecordError) {
    return { status: 409, code: 'not_initialized', message: err.message }
  }
  if (err instanceof UploadedNotPublishedError) {
    return {
      status: 502,
      code: 'uploaded_not_published',
      message: 'Release uploaded, but the public address still points to the previous release',
      extra: { collectionReference: err.collectionReference },
    }
  }
  if (err instanceof Error) {
    return { status: 500, code: 'internal_error', message: err.message }
  }
  return { status: 500, code: 'unknown_error', message: 'An unknown error occurred.' }
}
