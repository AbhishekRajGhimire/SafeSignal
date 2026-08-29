import type { Warning } from '@/lib/domain/warning'

export interface WarningFeed {
  warnings: Warning[]
  fetchedAt: Date | null
  stale: boolean
}

/**
 * The single seam the whole application depends on. Live and demo mode are
 * two implementations, so demo mode exercises the real app rather than a
 * parallel fake.
 */
export interface WarningSource {
  subscribe(onFeed: (feed: WarningFeed) => void): () => void
}
