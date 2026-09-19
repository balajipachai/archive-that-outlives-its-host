import { z } from 'zod'
import { isValidSha256Hex } from './hash-shape.js'
import { normalizeRelativePath } from './paths.js'

const HEX64 = /^[0-9a-f]{64}$/
const ETH_ADDRESS = /^0x[0-9a-fA-F]{40}$/

export const ArchiveFileEntrySchema = z
  .object({
    path: z.string().min(1),
    contentType: z.string().min(1),
    sizeBytes: z.number().int().nonnegative(),
    sha256: z.string().refine(isValidSha256Hex, 'sha256 must be 64 lowercase hex characters'),
    description: z.string().optional(),
  })
  .superRefine((entry, ctx) => {
    try {
      normalizeRelativePath(entry.path)
    } catch (err) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: err instanceof Error ? err.message : 'invalid path',
        path: ['path'],
      })
    }
  })

export const ArchiveReleaseSchema = z
  .object({
    format: z.literal('org.road-to-devcon.archive-release'),
    version: z.literal(1),
    releaseId: z.string().min(1),
    title: z.string().min(1),
    publishedAt: z.string().datetime({ offset: true }).or(z.string().datetime()),
    files: z.array(ArchiveFileEntrySchema).min(1, 'a release must contain at least one file'),
  })
  .superRefine((release, ctx) => {
    const seen = new Set<string>()
    for (const [index, file] of release.files.entries()) {
      let normalized: string
      try {
        normalized = normalizeRelativePath(file.path)
      } catch {
        continue // already reported by ArchiveFileEntrySchema
      }
      if (seen.has(normalized)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate normalized path "${normalized}"`,
          path: ['files', index, 'path'],
        })
      }
      seen.add(normalized)
    }
  })

export const ArchivePublicationRecordSchema = z.object({
  format: z.literal('org.road-to-devcon.archive-publication'),
  version: z.literal(1),
  feed: z.object({
    owner: z.string().regex(ETH_ADDRESS, 'owner must be a 0x-prefixed 20-byte address'),
    topic: z.string().min(1),
    manifestReference: z.string().regex(HEX64, 'manifestReference must be 64 hex characters'),
  }),
  initializationBatchId: z.string().regex(HEX64, 'initializationBatchId must be 64 hex characters'),
  archiveAddress: z.string().startsWith('bzz://'),
  createdAt: z.string().min(1),
  recovery: z.object({
    inputOptions: z.array(z.string()).min(1),
    collectionEndpointFamily: z.literal('bzz'),
    addressGrammar: z.string().min(1),
  }),
})

export const ArchiveReleaseReceiptSchema = z.object({
  format: z.literal('org.road-to-devcon.archive-release-receipt'),
  version: z.literal(1),
  releaseId: z.string().min(1),
  feedManifestReference: z.string().regex(HEX64),
  collectionReference: z.string().regex(HEX64),
  feedIndex: z.string().min(1),
  batchId: z.string().regex(HEX64),
  immutableObservedAt: z.string().min(1),
  batchDurationObservedAt: z.string().min(1),
  batchDurationSeconds: z.number().nonnegative().nullable(),
  publishedAt: z.string().min(1),
  fileCount: z.number().int().positive(),
  totalSizeBytes: z.number().int().nonnegative(),
})

export type ArchiveReleaseParsed = z.infer<typeof ArchiveReleaseSchema>
export type ArchivePublicationRecordParsed = z.infer<typeof ArchivePublicationRecordSchema>
export type ArchiveReleaseReceiptParsed = z.infer<typeof ArchiveReleaseReceiptSchema>

export class ArchiveFormatValidationError extends Error {
  constructor(
    message: string,
    public readonly issues: z.ZodIssue[],
  ) {
    super(message)
    this.name = 'ArchiveFormatValidationError'
  }
}

export function parseArchiveRelease(data: unknown): ArchiveReleaseParsed {
  const result = ArchiveReleaseSchema.safeParse(data)
  if (!result.success) {
    throw new ArchiveFormatValidationError('archive-release.json failed schema validation', result.error.issues)
  }
  return result.data
}

export function parseArchivePublicationRecord(data: unknown): ArchivePublicationRecordParsed {
  const result = ArchivePublicationRecordSchema.safeParse(data)
  if (!result.success) {
    throw new ArchiveFormatValidationError('archive-publication.json failed schema validation', result.error.issues)
  }
  return result.data
}
