import { normalizeFeed, FEED_SOURCE } from './normalize'
import type { FeedRejection } from './validate'
import type { Warning, WarningWire } from '@/lib/domain/warning'

export const FEED_URL = FEED_SOURCE.feedUrl

/**
 * The feed's own HTTP cache-control says `max-age=30` — thirty SECONDS.
 * Its RSS channel separately says `<ttl>60</ttl>` — sixty MINUTES.
 *
 * They disagree by a factor of 120, and neither is a promise that a warning
 * cannot change sooner. We hold the short one and revalidate every time,
 * because during a fire the cost of being early is a wasted request and the
 * cost of being late is somebody not being told.
 */
const CACHE_MS = 30_000

/** An unreachable feed must not hold a serverless invocation open. */
const TIMEOUT_MS = 8_000

export type FeedFailure =
  | 'timeout'
  | 'network'
  | 'http-error'
  | 'invalid-json'
  | `invalid-schema:${FeedRejection}`

export interface FeedSnapshot {
  warnings: Warning[]
  fetchedAt: Date | null
  /** True whenever these warnings did not come from a successful live read. */
  stale: boolean
  dropped: number
  duplicates: number
  /** Why the most recent attempt failed, when it did. */
  failure: FeedFailure | null
  feedLastModified: Date | null
}

export interface WarningsResponse {
  warnings: WarningWire[]
  fetchedAt: string | null
  stale: boolean
  dropped: number
  duplicates: number
  failure: FeedFailure | null
  feedLastModified: string | null
  source: {
    name: string
    url: string
    copyright: string
  }
}

interface CacheEntry {
  warnings: Warning[]
  fetchedAt: Date
  dropped: number
  duplicates: number
  feedLastModified: Date | null
  /** Response validators, so a poll can be answered with a cheap 304. */
  etag: string | null
  lastModified: string | null
}

let cache: CacheEntry | null = null

export function __resetFeedCacheForTests(): void {
  cache = null
}

function snapshotFrom(entry: CacheEntry, stale: boolean, failure: FeedFailure | null): FeedSnapshot {
  return {
    warnings: entry.warnings,
    fetchedAt: entry.fetchedAt,
    stale,
    dropped: entry.dropped,
    duplicates: entry.duplicates,
    failure,
    feedLastModified: entry.feedLastModified,
  }
}

const EMPTY: FeedSnapshot = {
  warnings: [],
  fetchedAt: null,
  stale: true,
  dropped: 0,
  duplicates: 0,
  failure: null,
  feedLastModified: null,
}

function parseHttpDate(value: string | null): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export async function getFeed(): Promise<FeedSnapshot> {
  const now = Date.now()

  if (cache && now - cache.fetchedAt.getTime() < CACHE_MS) {
    return snapshotFrom(cache, false, null)
  }

  // Conditional request: the feed supplies both ETag and Last-Modified, so a
  // poll that finds nothing new costs a 304 rather than a full payload.
  const headers: Record<string, string> = { accept: 'application/json' }
  if (cache?.etag) headers['if-none-match'] = cache.etag
  if (cache?.lastModified) headers['if-modified-since'] = cache.lastModified

  let response: Response
  try {
    response = await fetch(FEED_URL, {
      headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError'
    return degrade(timedOut ? 'timeout' : 'network')
  }

  if (response.status === 304 && cache) {
    // Nothing changed upstream. Treat it as a successful read: the data is
    // confirmed current, so the freshness clock restarts.
    cache = { ...cache, fetchedAt: new Date(now) }
    return snapshotFrom(cache, false, null)
  }

  if (!response.ok) return degrade('http-error')

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    return degrade('invalid-json')
  }

  const feedLastModified = parseHttpDate(response.headers.get('last-modified'))
  const result = normalizeFeed(payload, {
    retrievedAt: new Date(now),
    feedLastModified,
  })

  if (result.rejected) return degrade(`invalid-schema:${result.rejected}`)

  cache = {
    warnings: result.warnings,
    fetchedAt: new Date(now),
    dropped: result.dropped,
    duplicates: result.duplicates,
    feedLastModified,
    etag: response.headers.get('etag'),
    lastModified: response.headers.get('last-modified'),
  }

  return snapshotFrom(cache, false, null)
}

/**
 * Never propagate a failure. A stale warning beats no warning during a
 * bushfire, so the last good payload is re-served, flagged, with the reason
 * carried through so the interface can say what actually went wrong.
 */
function degrade(failure: FeedFailure): FeedSnapshot {
  if (cache) return snapshotFrom(cache, true, failure)
  return { ...EMPTY, failure }
}
