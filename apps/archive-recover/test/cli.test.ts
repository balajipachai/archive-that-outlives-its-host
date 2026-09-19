import { NoReleasePublishedError, type RecoveryResult } from '@archive/swarm-recovery/node'
import { describe, expect, it, vi } from 'vitest'
import { buildProgram, describeRecoveryError, formatSuccessReport } from '../src/cli.js'

function sampleResult(): RecoveryResult {
  return {
    resolved: { mode: 'manifest', addressReference: 'a'.repeat(64), normalizedInput: `bzz://${'a'.repeat(64)}/`, feedIndex: null },
    releaseId: 'release-1',
    title: 'Spiti Folios v1',
    publishedAt: new Date().toISOString(),
    files: [{ path: 'a.jpg', contentType: 'image/jpeg', sizeBytes: 10, sha256: 'x'.repeat(64), verified: true }],
    outputDir: '/tmp/out',
  }
}

describe('archive-recover CLI', () => {
  it('calls recover with the manifest input and reports success', async () => {
    const recoverFn = vi.fn().mockResolvedValue(sampleResult())
    const program = buildProgram(recoverFn)
    program.exitOverride()

    await program.parseAsync(
      ['--manifest', 'a'.repeat(64), '--endpoint', 'http://localhost:1633', '--out', '/tmp/out'],
      { from: 'user' },
    )

    expect(recoverFn).toHaveBeenCalledTimes(1)
    const call = recoverFn.mock.calls[0]![0]
    expect(call.manifest).toBe('a'.repeat(64))
    expect(call.endpoint).toBe('http://localhost:1633')
    expect(process.exitCode).toBe(0)
    process.exitCode = 0
  })

  it('calls recover with owner+topic input', async () => {
    const recoverFn = vi.fn().mockResolvedValue(sampleResult())
    const program = buildProgram(recoverFn)
    program.exitOverride()

    await program.parseAsync(
      ['--owner', '0x1234567890123456789012345678901234567890', '--topic', 'spiti-folios-v1', '--endpoint', 'http://localhost:1633', '--out', '/tmp/out'],
      { from: 'user' },
    )

    const call = recoverFn.mock.calls[0]![0]
    expect(call.owner).toBe('0x1234567890123456789012345678901234567890')
    expect(call.topic).toBe('spiti-folios-v1')
    process.exitCode = 0
  })

  it('sets a nonzero exit code and prints a specific message on a defined failure', async () => {
    const recoverFn = vi.fn().mockRejectedValue(new NoReleasePublishedError())
    const program = buildProgram(recoverFn)
    program.exitOverride()

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await program.parseAsync(['--manifest', 'a'.repeat(64), '--endpoint', 'http://localhost:1633', '--out', '/tmp/out'], {
      from: 'user',
    })

    expect(process.exitCode).toBe(1)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('No release has been published yet'))
    errorSpy.mockRestore()
    process.exitCode = 0
  })
})

describe('describeRecoveryError', () => {
  it('describes a NoReleasePublishedError', () => {
    expect(describeRecoveryError(new NoReleasePublishedError())).toContain('No release has been published yet')
  })

  it('falls back for an unknown thrown value', () => {
    expect(describeRecoveryError('not an error')).toBe('Recovery failed with an unknown error.')
  })
})

describe('formatSuccessReport', () => {
  it('includes the release title, resolved address, and file inventory', () => {
    const report = formatSuccessReport(sampleResult())
    expect(report).toContain('Spiti Folios v1')
    expect(report).toContain('a.jpg')
    expect(report).toContain('/tmp/out')
  })
})
