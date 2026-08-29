import type { Warning } from '@/lib/domain/warning'
import type { WarningChange } from '@/lib/domain/lifecycle'
import type { Freshness } from '@/lib/domain/freshness'
import type { FeedFailure } from '@/lib/rfs/fetch'

export interface WarningFeed {
  warnings: Warning[]
  fetchedAt: Date | null
  /** Retained for existing callers. `freshness` is the richer signal. */
  stale: boolean
  freshness: Freshness
  /** What changed since the previous emission. Empty on the first one. */
  changes: WarningChange[]
  /** The warnings from the previous emission, for describing the changes. */
  previous: Warning[]
  /** Why the last read failed, when it did. Null on success. */
  failure: FeedFailure | null
  dropped: number
  duplicates: number
}

/**
 * The single seam the whole application depends on. Live and demo mode are
 * two implementations, so demo mode exercises the real app rather than a
 * parallel fake.
 */
export interface WarningSource {
  subscribe(onFeed: (feed: WarningFeed) => void): () => void
}

export const EMPTY_FEED: WarningFeed = {
  warnings: [],
  fetchedAt: null,
  stale: false,
  freshness: 'unavailable',
  changes: [],
  previous: [],
  failure: null,
  dropped: 0,
  duplicates: 0,
}
