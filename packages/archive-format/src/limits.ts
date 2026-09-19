/**
 * Practical, documented limits for one release. Overridable via environment
 * variables at the app layer (see .env.example); these are the defaults.
 */
export const DEFAULT_LIMITS = {
  maxFileBytes: 50 * 1024 * 1024, // 50 MiB per file
  maxTotalBytes: 512 * 1024 * 1024, // 512 MiB per release
  maxFileCount: 5000,
} as const

export type ArchiveLimits = typeof DEFAULT_LIMITS
