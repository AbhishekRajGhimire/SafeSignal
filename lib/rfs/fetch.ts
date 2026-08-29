import { normalizeFeed } from './normalize'
import type { Warning, WarningWire } from '@/lib/domain/warning'

export const FEED_URL = 'https://www.rfs.nsw.gov.au/feeds/majorIncidents.json'

/** Matches the cache lifetime the feed declares for itself. */
const CACHE_MS = 30_000

export interface FeedSnapshot {
  warnings: Warning[]
  fetchedAt: Date | null
  stale: boolean
  dropped: number
}

export interface WarningsResponse {
  warnings: WarningWire[]
  fetchedAt: string | null
  stale: boolean
  dropped: number
}

let cache: { warnings: Warning[]; fetchedAt: Date; dropped: number } | null = null

export function __resetFeedCacheForTests(): void {
  cache = null
}

export async function getFeed(): Promise<FeedSnapshot> {
  const now = Date.now()

  if (cache && now - cache.fetchedAt.getTime() < CACHE_MS) {
    return { ...cache, stale: false }
  }

  try {
    const response = await fetch(FEED_URL, {
      headers: { accept: 'application/json' },
      cache: 'no-store',
    })
    if (!response.ok) throw new Error(`RFS feed responded ${response.status}`)

    const { warnings, dropped } = normalizeFeed(await response.json())
    cache = { warnings, dropped, fetchedAt: new Date(now) }
    return { warnings, dropped, fetchedAt: cache.fetchedAt, stale: false }
  } catch {
    // Never propagate. A stale warning beats no warning during a bushfire.
    if (cache) return { ...cache, stale: true }
    return { warnings: [], dropped: 0, fetchedAt: null, stale: true }
  }
}
