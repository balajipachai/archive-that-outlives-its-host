export interface BatchHealthDto {
  batchId: string
  usable: boolean
  immutableFlag: boolean
  utilization: number
  durationSeconds: number
  observedAt: string
  warning: boolean
  warningThresholdDays: number
}

export type PublisherStateDto =
  | { kind: 'node-unavailable'; detail: string }
  | { kind: 'ultra-light-or-unfunded'; detail: string; beeMode: string }
  | { kind: 'batch-not-immutable'; detail: string; batchId: string }
  | { kind: 'ready'; batch: BatchHealthDto }
  | { kind: 'batch-warning'; batch: BatchHealthDto }
  | { kind: 'uploading-release' }
  | { kind: 'advancing-feed' }
  | { kind: 'verifying' }
  | { kind: 'published'; result: PublishSuccessDto }
  | { kind: 'uploaded-not-published'; collectionReference: string; reason: string }

export interface PublishSuccessDto {
  releaseId: string
  feedManifestReference: string
  collectionReference: string
  feedIndex: string
  batchId: string
  archiveAddress: string
  owner: string
  topic: string
  fileCount: number
  totalSizeBytes: number
  publishedAt: string
}

export interface PublicationRecordDto {
  feed: { owner: string; topic: string; manifestReference: string }
  archiveAddress: string
  initializationBatchId: string
  createdAt: string
}

let csrfToken: string | null = null

class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function parseJsonOrThrow(res: Response) {
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new ApiError(res.status, body.message ?? `Request failed with status ${res.status}`, body.error)
  }
  return body
}

export { ApiError }

export async function bootstrapSession(token: string): Promise<void> {
  const res = await fetch('/api/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ token }),
  })
  const body = await parseJsonOrThrow(res)
  csrfToken = body.csrfToken
}

export function hasSession(): boolean {
  return csrfToken !== null
}

async function authedPost(path: string, payload: unknown) {
  if (!csrfToken) throw new ApiError(401, 'Not signed in to the local publisher session yet.')
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
    credentials: 'same-origin',
    body: JSON.stringify(payload),
  })
  return parseJsonOrThrow(res)
}

export async function fetchStatus(endpoint: string, batchId: string, warningThresholdDays?: number): Promise<PublisherStateDto> {
  const params = new URLSearchParams({ endpoint, batchId })
  if (warningThresholdDays) params.set('warningThresholdDays', String(warningThresholdDays))
  const res = await fetch(`/api/status?${params}`)
  const body = await parseJsonOrThrow(res)
  return body.state
}

export async function fetchBatches(endpoint: string) {
  const params = new URLSearchParams({ endpoint })
  const res = await fetch(`/api/batches?${params}`)
  const body = await parseJsonOrThrow(res)
  return body.batches as Array<{ batchId: string; usable: boolean; immutableFlag: boolean; utilization: number; durationSeconds: number; label: string }>
}

export async function fetchPublicationRecord(): Promise<PublicationRecordDto | null> {
  const res = await fetch('/api/publication-record')
  const body = await parseJsonOrThrow(res)
  return body.record
}

export async function fetchPublishProgress(): Promise<PublisherStateDto | null> {
  const res = await fetch('/api/publish/progress')
  const body = await parseJsonOrThrow(res)
  return body.state
}

export async function createBatch(input: { endpoint: string; amount: string; depth: number; label?: string }): Promise<string> {
  const body = await authedPost('/api/batches', input)
  return body.batchId
}

export async function initFeed(input: { endpoint: string; batchId: string; topic: string }) {
  const body = await authedPost('/api/init', input)
  return body.result
}

export async function publishRelease(input: { endpoint: string; batchId: string; input: string; title: string }): Promise<PublishSuccessDto> {
  const body = await authedPost('/api/publish', input)
  return body.result
}

export async function testRecovery(params: { endpoint: string; manifest?: string; owner?: string; topic?: string }) {
  const query = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined)) as Record<string, string>)
  const res = await fetch(`/api/recover-test?${query}`)
  return parseJsonOrThrow(res)
}
