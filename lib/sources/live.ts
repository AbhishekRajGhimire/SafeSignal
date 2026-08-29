import { fromWire, type Warning, type WarningWire } from '@/lib/domain/warning'
import { diffWarnings } from '@/lib/domain/lifecycle'
import { freshnessOf } from '@/lib/domain/freshness'
import type { FeedFailure } from '@/lib/rfs/fetch'
import type { WarningFeed, WarningSource } from './types'

/**
 * The feed's HTTP cache-control says thirty seconds; its RSS ttl says sixty
 * minutes. We poll on the short one. A publisher's refresh interval is a hint
 * about when data is likely to change, never a guarantee that it cannot
 * change sooner.
 */
const DEFAULT_POLL_MS = 60_000

interface WarningsResponseBody {
  warnings: WarningWire[]
  fetchedAt: string | null
  stale: boolean
  dropped?: number
  duplicates?: number
  failure?: FeedFailure | null
}

export class LiveSource implements WarningSource {
  private lastGood: { warnings: Warning[]; fetchedAt: Date | null } | null = null
  /** The previous emission, so each new one can be described as a diff. */
  private previous: Warning[] = []
  private emitted = false

  constructor(private readonly pollMs: number = DEFAULT_POLL_MS) {}

  subscribe(onFeed: (feed: WarningFeed) => void): () => void {
    let active = true

    const poll = async () => {
      const feed = await this.fetchOnce()
      if (active) onFeed(feed)
    }

    void poll()
    const timer = setInterval(() => void poll(), this.pollMs)

    return () => {
      active = false
      clearInterval(timer)
    }
  }

  /** The first emission is a baseline, not a burst of "new warning" events. */
  private describe(warnings: Warning[]) {
    const changes = this.emitted ? diffWarnings(this.previous, warnings) : []
    this.previous = warnings
    this.emitted = true
    return changes
  }

  private async fetchOnce(): Promise<WarningFeed> {
    try {
      const response = await fetch('/api/warnings', { cache: 'no-store' })
      if (!response.ok) throw new Error(`warnings route responded ${response.status}`)

      const body = (await response.json()) as WarningsResponseBody
      const warnings = body.warnings.map(fromWire)
      const fetchedAt = body.fetchedAt ? new Date(body.fetchedAt) : null

      this.lastGood = { warnings, fetchedAt }
      return {
        warnings,
        fetchedAt,
        stale: body.stale,
        freshness: body.stale ? 'stale' : freshnessOf(fetchedAt),
        changes: this.describe(warnings),
        failure: body.failure ?? null,
        dropped: body.dropped ?? 0,
        duplicates: body.duplicates ?? 0,
      }
    } catch {
      // The device is offline or the route is unreachable. Re-emit what we
      // have, flagged, so the screen keeps showing the last warning.
      const warnings = this.lastGood?.warnings ?? []
      const fetchedAt = this.lastGood?.fetchedAt ?? null
      return {
        warnings,
        fetchedAt,
        stale: true,
        freshness: fetchedAt ? freshnessOf(fetchedAt) : 'unavailable',
        // Nothing changed upstream that we know of: we simply could not look.
        changes: [],
        failure: 'network',
        dropped: 0,
        duplicates: 0,
      }
    }
  }
}
