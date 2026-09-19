import { useEffect, useRef, useState } from 'react'
import {
  ApiError,
  bootstrapSession,
  createBatch,
  fetchPublicationRecord,
  fetchPublishProgress,
  fetchStatus,
  hasSession,
  initFeed,
  publishRelease,
  testRecovery,
  type PublicationRecordDto,
  type PublisherStateDto,
} from './lib/api-client.js'

function BootstrapGate({ onReady }: { onReady: () => void }) {
  const [token, setToken] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await bootstrapSession(token)
      onReady()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start a session.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main style={{ maxWidth: 480, margin: '4rem auto', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Archive Publisher</h1>
      <p>Enter the local operator token you generated for this machine. It is checked once and never stored in the browser.</p>
      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '0.75rem' }}>
        <input
          type="password"
          placeholder="Local operator token"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          required
        />
        <button type="submit" disabled={busy}>
          {busy ? 'Checking…' : 'Continue'}
        </button>
      </form>
      {error && <p style={{ color: '#a40000' }}>{error}</p>}
    </main>
  )
}

function stateHeadline(state: PublisherStateDto | null): string {
  if (!state) return 'Not checked yet'
  switch (state.kind) {
    case 'node-unavailable':
      return 'Cannot reach this Bee node'
    case 'ultra-light-or-unfunded':
      return 'This node can read but cannot publish yet'
    case 'batch-not-immutable':
      return 'This batch cannot be used for a preservation release'
    case 'batch-warning':
      return 'Storage payment needs attention'
    case 'ready':
      return 'Ready to publish'
    case 'uploading-release':
      return 'Uploading immutable release…'
    case 'advancing-feed':
      return 'Updating the stable archive address…'
    case 'verifying':
      return 'Checking the public recovery path…'
    case 'published':
      return 'Published and recoverable'
    case 'uploaded-not-published':
      return 'Release uploaded, but the public address still points to the previous release'
  }
}

function BatchHealthCard({ batch, warningThresholdDays }: { batch: { usable: boolean; immutableFlag: boolean; utilization: number; durationSeconds: number; observedAt: string; warning: boolean }; warningThresholdDays: number }) {
  const days = (batch.durationSeconds / 86_400).toFixed(1)
  return (
    <div style={{ border: '1px solid #ccc', borderRadius: 6, padding: '0.75rem', marginTop: '0.75rem' }}>
      <strong>Storage health</strong>
      <p style={{ margin: '0.4rem 0' }}>
        Node-reported remaining duration: <strong>{days} days</strong> ({batch.durationSeconds}s), observed at{' '}
        {new Date(batch.observedAt).toLocaleString()}.
      </p>
      <p style={{ margin: '0.4rem 0', fontSize: '0.9rem' }}>
        Immutable: {String(batch.immutableFlag)} · usable: {String(batch.usable)} · utilization: {(batch.utilization * 100).toFixed(0)}%
      </p>
      {batch.warning && (
        <p style={{ color: '#a45c00' }}>Below the {warningThresholdDays}-day warning threshold — renew soon.</p>
      )}
      <p style={{ fontSize: '0.85rem', fontStyle: 'italic' }}>
        This release is paid for through the node-reported storage window. Keep renewing the batch; this app cannot
        promise permanent access.
      </p>
    </div>
  )
}

export function App() {
  const [signedIn, setSignedIn] = useState(hasSession())
  const [endpoint, setEndpoint] = useState('http://localhost:1633')
  const [batchId, setBatchId] = useState('')
  const [topic, setTopic] = useState('spiti-folios-v1')
  const [inputDir, setInputDir] = useState('')
  const [title, setTitle] = useState('')

  const [status, setStatus] = useState<PublisherStateDto | null>(null)
  const [record, setRecord] = useState<PublicationRecordDto | null>(null)
  const [busy, setBusy] = useState<'checking' | 'creating-batch' | 'initializing' | 'publishing' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [recoveryCheck, setRecoveryCheck] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    fetchPublicationRecord().then(setRecord).catch(() => setRecord(null))
  }, [signedIn])

  async function handleCheckStatus() {
    setBusy('checking')
    setError(null)
    try {
      const state = await fetchStatus(endpoint, batchId)
      setStatus(state)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach the publisher service.')
    } finally {
      setBusy(null)
    }
  }

  async function handleCreateBatch() {
    setBusy('creating-batch')
    setError(null)
    try {
      const id = await createBatch({ endpoint, amount: '500000000', depth: 20, label: 'archive-preservation' })
      setBatchId(id)
      await handleCheckStatus()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create a batch.')
    } finally {
      setBusy(null)
    }
  }

  async function handleInit() {
    setBusy('initializing')
    setError(null)
    try {
      const result = await initFeed({ endpoint, batchId, topic })
      setRecord({
        feed: { owner: result.ownerAddress, topic: result.topic, manifestReference: result.feedManifestReference },
        archiveAddress: result.archiveAddress,
        initializationBatchId: result.batchId,
        createdAt: new Date().toISOString(),
      })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Initialization failed.')
    } finally {
      setBusy(null)
    }
  }

  function startPolling() {
    stopPolling()
    pollRef.current = setInterval(async () => {
      try {
        const state = await fetchPublishProgress()
        if (state) setStatus(state)
      } catch {
        // transient — the final result from the POST response is authoritative anyway
      }
    }, 700)
  }

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }

  useEffect(() => stopPolling, [])

  async function handlePublish() {
    setBusy('publishing')
    setError(null)
    setRecoveryCheck(null)
    startPolling()
    try {
      const result = await publishRelease({ endpoint, batchId, input: inputDir, title: title || 'Untitled release' })
      setStatus({ kind: 'published', result })
      setRecord({
        feed: { owner: result.owner, topic: result.topic, manifestReference: result.feedManifestReference },
        archiveAddress: result.archiveAddress,
        initializationBatchId: result.batchId,
        createdAt: result.publishedAt,
      })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Publish failed.')
    } finally {
      stopPolling()
      setBusy(null)
    }
  }

  async function handleTestRecovery() {
    if (!record) return
    setRecoveryCheck('Running…')
    try {
      const result = await testRecovery({ endpoint, manifest: record.feed.manifestReference })
      setRecoveryCheck(`Recovered "${result.title}" — ${result.fileCount} file(s) verified independently.`)
    } catch (err) {
      setRecoveryCheck(err instanceof ApiError ? err.message : 'Independent recovery check failed.')
    }
  }

  if (!signedIn) {
    return <BootstrapGate onReady={() => setSignedIn(true)} />
  }

  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '2rem 1rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Archive Publisher</h1>
      <p>
        Publishing to Swarm behind a stable feed address is not the same as "an upload returned a hash." The address
        below stays the same across releases; storage is paid for a node-reported window, never promised forever.
      </p>

      {record && (
        <section style={{ border: '1px solid #2a7', borderRadius: 6, padding: '0.75rem', marginBottom: '1rem' }}>
          <strong>Share this stable archive address</strong>
          <p style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{record.archiveAddress}</p>
          <p style={{ fontSize: '0.85rem' }}>
            Owner: <code>{record.feed.owner}</code> · Topic: <code>{record.feed.topic}</code>
          </p>
          <button onClick={handleTestRecovery}>Test independent recovery</button>
          {recoveryCheck && <p>{recoveryCheck}</p>}
        </section>
      )}

      <section style={{ display: 'grid', gap: '0.5rem', marginBottom: '1rem' }}>
        <label>
          Bee endpoint
          <input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} style={{ width: '100%' }} />
        </label>
        <label>
          Batch ID
          <input value={batchId} onChange={(e) => setBatchId(e.target.value)} style={{ width: '100%' }} placeholder="existing postage batch ID" />
        </label>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={handleCheckStatus} disabled={busy !== null || !endpoint || !batchId}>
            Check status
          </button>
          <button onClick={handleCreateBatch} disabled={busy !== null || !endpoint}>
            Create immutable batch
          </button>
        </div>
      </section>

      {status && (
        <section style={{ marginBottom: '1rem' }}>
          <strong>{stateHeadline(status)}</strong>
          {(status.kind === 'ready' || status.kind === 'batch-warning') && (
            <BatchHealthCard batch={status.batch} warningThresholdDays={status.batch.warningThresholdDays} />
          )}
          {status.kind === 'uploaded-not-published' && (
            <p>Collection reference: <code>{status.collectionReference}</code> — retry feed advancement only.</p>
          )}
        </section>
      )}

      {!record && (
        <section style={{ marginBottom: '1rem' }}>
          <h2>Initialize the feed (once)</h2>
          <label>
            Topic
            <input value={topic} onChange={(e) => setTopic(e.target.value)} style={{ width: '100%' }} />
          </label>
          <button onClick={handleInit} disabled={busy !== null || !batchId || !topic}>
            {busy === 'initializing' ? 'Initializing…' : 'Initialize feed'}
          </button>
        </section>
      )}

      <section>
        <h2>Publish a release</h2>
        <label>
          Input directory (on this machine, readable by the publisher service)
          <input value={inputDir} onChange={(e) => setInputDir(e.target.value)} style={{ width: '100%' }} placeholder="/Users/you/folios" />
        </label>
        <label>
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} style={{ width: '100%' }} placeholder="Spiti Folios v1" />
        </label>
        <button onClick={handlePublish} disabled={busy !== null || !record || !inputDir}>
          {busy === 'publishing' ? 'Publishing…' : 'Publish'}
        </button>
        {!record && <p style={{ fontSize: '0.85rem' }}>Initialize the feed first.</p>}
      </section>

      {error && (
        <p role="alert" style={{ color: '#a40000', fontWeight: 600, marginTop: '1rem' }}>
          {error}
        </p>
      )}
    </main>
  )
}
