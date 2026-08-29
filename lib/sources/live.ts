import { fromWire, type Warning, type WarningWire } from '@/lib/domain/warning'
import type { WarningFeed, WarningSource } from './types'

const DEFAULT_POLL_MS = 60_000

interface WarningsResponseBody {
  warnings: WarningWire[]
  fetchedAt: string | null
  stale: boolean
}

export class LiveSource implements WarningSource {
  private lastGood: { warnings: Warning[]; fetchedAt: Date | null } | null = null

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

  private async fetchOnce(): Promise<WarningFeed> {
    try {
      const response = await fetch('/api/warnings', { cache: 'no-store' })
      if (!response.ok) throw new Error(`warnings route responded ${response.status}`)

      const body = (await response.json()) as WarningsResponseBody
      const warnings = body.warnings.map(fromWire)
      const fetchedAt = body.fetchedAt ? new Date(body.fetchedAt) : null

      this.lastGood = { warnings, fetchedAt }
      return { warnings, fetchedAt, stale: body.stale }
    } catch {
      // The device is offline or the route is unreachable. Re-emit what we
      // have, flagged stale, so the screen keeps showing the last warning.
      if (this.lastGood) return { ...this.lastGood, stale: true }
      return { warnings: [], fetchedAt: null, stale: true }
    }
  }
}
