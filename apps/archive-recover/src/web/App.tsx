import { useState } from 'react'
import {
  EndpointUnreachableError,
  InvalidRecoveryInputError,
  NoReleasePublishedError,
} from '@archive/swarm-recovery'
import {
  browserRecover,
  HashMismatchError,
  MalformedManifestError,
  MissingFileError,
  type BrowserRecoveryResult,
} from './lib/browser-recover.js'
import { downloadFileIndividually, saveFilesToDirectory, supportsDirectoryPicker } from './lib/save-files.js'

type Mode = 'manifest' | 'owner-topic'
type ProgressEvent = { path: string; index: number; total: number }
type Phase = 'idle' | 'resolving' | 'done' | 'error'

function describeError(err: unknown): string {
  if (err instanceof NoReleasePublishedError) return 'No release has been published yet at this address.'
  if (err instanceof EndpointUnreachableError) return `Cannot reach that endpoint. Is a Bee node or gateway running there? (${err.message})`
  if (err instanceof InvalidRecoveryInputError) return err.message
  if (err instanceof MalformedManifestError) return `The release manifest is malformed: ${err.message}`
  if (err instanceof MissingFileError) return `A file is missing from the collection: ${err.path}`
  if (err instanceof HashMismatchError) return `Hash mismatch: "${err.path}" does not match the published manifest. Do not trust this file.`
  if (err instanceof Error) return err.message
  return 'Recovery failed with an unknown error.'
}

export function App() {
  const [mode, setMode] = useState<Mode>('manifest')
  const [manifest, setManifest] = useState('')
  const [owner, setOwner] = useState('')
  const [topic, setTopic] = useState('')
  const [endpoint, setEndpoint] = useState('http://localhost:1633')
  const [acknowledgedPublic, setAcknowledgedPublic] = useState(false)

  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState<ProgressEvent | null>(null)
  const [result, setResult] = useState<BrowserRecoveryResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savedFolder, setSavedFolder] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPhase('resolving')
    setError(null)
    setResult(null)
    setSavedFolder(false)
    setProgress(null)

    try {
      const recovered = await browserRecover({
        mode,
        manifest: mode === 'manifest' ? manifest : undefined,
        owner: mode === 'owner-topic' ? owner : undefined,
        topic: mode === 'owner-topic' ? topic : undefined,
        endpoint,
        onProgress: setProgress,
      })
      setResult(recovered)
      setPhase('done')
    } catch (err) {
      setError(describeError(err))
      setPhase('error')
    }
  }

  async function handleSaveToFolder() {
    if (!result) return
    try {
      await saveFilesToDirectory(result.files)
      setSavedFolder(true)
    } catch (err) {
      setError(describeError(err))
    }
  }

  function handleDownloadAllFlat() {
    if (!result) return
    for (const file of result.files) downloadFileIndividually(file)
    setSavedFolder(true)
  }

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '2rem 1rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Archive Recovery Reader</h1>
      <p>
        This reader takes only what a stranger could have been handed: a stable archive address (or the feed
        owner + topic), plus a Bee or content-gateway endpoint. It reads no local index, database, or publisher
        state file.
      </p>

      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '0.75rem', marginTop: '1.5rem' }}>
        <fieldset style={{ display: 'flex', gap: '1rem' }}>
          <label>
            <input type="radio" checked={mode === 'manifest'} onChange={() => setMode('manifest')} /> Archive address /
            manifest reference
          </label>
          <label>
            <input type="radio" checked={mode === 'owner-topic'} onChange={() => setMode('owner-topic')} /> Owner + topic
          </label>
        </fieldset>

        {mode === 'manifest' ? (
          <label>
            Archive address
            <input
              type="text"
              placeholder="bzz://<64-hex>/ or a bare manifest reference"
              value={manifest}
              onChange={(e) => setManifest(e.target.value)}
              style={{ width: '100%' }}
              required
            />
          </label>
        ) : (
          <>
            <label>
              Feed owner address
              <input
                type="text"
                placeholder="0x..."
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                style={{ width: '100%' }}
                required
              />
            </label>
            <label>
              Feed topic
              <input
                type="text"
                placeholder="master-of-all"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                style={{ width: '100%' }}
                required
              />
            </label>
          </>
        )}

        <label>
          Bee or content-gateway endpoint
          <input
            type="text"
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
            style={{ width: '100%' }}
            required
          />
        </label>

        <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
          <input
            type="checkbox"
            checked={acknowledgedPublic}
            onChange={(e) => setAcknowledgedPublic(e.target.checked)}
          />
          <span>
            I understand this downloads publicly stored content from the Swarm network onto this device.
          </span>
        </label>

        <button type="submit" disabled={!acknowledgedPublic || phase === 'resolving'}>
          {phase === 'resolving' ? 'Recovering…' : 'Recover archive'}
        </button>
      </form>

      {progress && phase === 'resolving' && (
        <p style={{ marginTop: '1rem' }}>
          [{progress.index + 1}/{progress.total}] downloading and verifying {progress.path}…
        </p>
      )}

      {error && (
        <p role="alert" style={{ marginTop: '1rem', color: '#a40000', fontWeight: 600 }}>
          {error}
        </p>
      )}

      {result && (
        <section style={{ marginTop: '1.5rem' }}>
          <h2>{result.release.title}</h2>
          <p>
            Release {result.release.releaseId} · published {new Date(result.release.publishedAt).toLocaleString()}
          </p>
          <p>
            Resolved via: <code>{result.resolved.normalizedInput}</code>
            <br />
            Collection reference: <code>{result.resolved.addressReference}</code>
            {result.resolved.feedIndex !== null && <> · feed index {result.resolved.feedIndex}</>}
          </p>

          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>File</th>
                <th style={{ textAlign: 'right' }}>Size</th>
                <th style={{ textAlign: 'center' }}>Verified</th>
              </tr>
            </thead>
            <tbody>
              {result.files.map((file) => (
                <tr key={file.path}>
                  <td>{file.path}</td>
                  <td style={{ textAlign: 'right' }}>{file.sizeBytes.toLocaleString()} bytes</td>
                  <td style={{ textAlign: 'center' }}>{file.verified ? '✓' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem' }}>
            {supportsDirectoryPicker() ? (
              <button onClick={handleSaveToFolder}>Save all to a folder</button>
            ) : (
              <button onClick={handleDownloadAllFlat}>Download all files</button>
            )}
          </div>
          {savedFolder && <p>Saved {result.files.length} file(s).</p>}
        </section>
      )}
    </main>
  )
}
