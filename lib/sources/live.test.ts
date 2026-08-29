import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { LiveSource } from './live'
import type { WarningFeed } from './types'

const response = {
  warnings: [
    {
      id: 'incident-1',
      level: 'advice',
      title: 'TEST FIRE',
      location: 'Somewhere',
      council: 'Blue Mountains',
      status: 'Under control',
      type: 'Bush Fire',
      sizeHa: 5,
      agency: 'Rural Fire Service',
      updatedAt: '2026-08-29T04:12:00.000Z',
      publishedAt: '2026-08-29T04:12:00.000Z',
      point: { lat: -33.71, lon: 150.31 },
      polygons: [],
      officialUrl: 'https://example.invalid',
      rawAdvice: null,
      fields: {},
      raw: { properties: {}, geometry: null },
      provenance: {
        source: 'nsw-rfs',
        sourceName: 'NSW Rural Fire Service',
        feedUrl: 'https://www.rfs.nsw.gov.au/feeds/majorIncidents.json',
        copyright: 'State of New South Wales (NSW Rural Fire Service)',
        retrievedAt: '2026-08-29T12:00:00.000Z',
        feedLastModified: null,
        transform: 'normalized',
      },
    },
  ],
  fetchedAt: '2026-08-29T12:00:00.000Z',
  stale: false,
  dropped: 0,
  duplicates: 0,
  failure: null,
}

/** The same incident, escalated, for lifecycle assertions. */
const escalated = {
  ...response,
  warnings: [{ ...response.warnings[0], level: 'watch-and-act' }],
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('LiveSource', () => {
  it('emits a feed with revived Date objects on first poll', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => response }))
    const received: WarningFeed[] = []
    const source = new LiveSource(60_000)
    const unsubscribe = source.subscribe((feed) => received.push(feed))

    await vi.advanceTimersByTimeAsync(0)

    expect(received).toHaveLength(1)
    expect(received[0].warnings[0].updatedAt).toBeInstanceOf(Date)
    expect(received[0].stale).toBe(false)
    unsubscribe()
  })

  it('polls again after the interval', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => response })
    vi.stubGlobal('fetch', fetchMock)
    const source = new LiveSource(60_000)
    const unsubscribe = source.subscribe(() => {})

    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(60_000)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    unsubscribe()
  })

  it('stops polling once unsubscribed', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => response })
    vi.stubGlobal('fetch', fetchMock)
    const source = new LiveSource(60_000)
    const unsubscribe = source.subscribe(() => {})

    await vi.advanceTimersByTimeAsync(0)
    unsubscribe()
    await vi.advanceTimersByTimeAsync(180_000)

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('re-emits the last good feed marked stale when a poll fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => response })
      .mockRejectedValueOnce(new Error('offline'))
    vi.stubGlobal('fetch', fetchMock)

    const received: WarningFeed[] = []
    const source = new LiveSource(60_000)
    const unsubscribe = source.subscribe((feed) => received.push(feed))

    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(60_000)

    expect(received).toHaveLength(2)
    expect(received[1].warnings).toHaveLength(1)
    expect(received[1].stale).toBe(true)
    unsubscribe()
  })

  it('emits an empty stale feed when the very first poll fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    const received: WarningFeed[] = []
    const source = new LiveSource(60_000)
    const unsubscribe = source.subscribe((feed) => received.push(feed))

    await vi.advanceTimersByTimeAsync(0)

    expect(received[0].warnings).toEqual([])
    expect(received[0].stale).toBe(true)
    unsubscribe()
  })
})

describe('LiveSource lifecycle events', () => {
  it('reports no changes on the first emission, which is a baseline', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => response }))
    const received: WarningFeed[] = []
    const source = new LiveSource(60_000)
    const stop = source.subscribe((feed) => received.push(feed))
    await vi.advanceTimersByTimeAsync(0)
    stop()
    expect(received[0].changes).toEqual([])
  })

  it('reports a level change between polls', async () => {
    const spy = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => response })
      .mockResolvedValueOnce({ ok: true, json: async () => escalated })
    vi.stubGlobal('fetch', spy)
    const received: WarningFeed[] = []
    const source = new LiveSource(1_000)
    const stop = source.subscribe((feed) => received.push(feed))
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(1_000)
    stop()
    expect(received[1].changes).toEqual([
      { kind: 'level-changed', id: 'incident-1', from: 'advice', to: 'watch-and-act', escalated: true },
    ])
  })

  it('reports a cancellation when a warning leaves the feed', async () => {
    const spy = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => response })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ...response, warnings: [] }) })
    vi.stubGlobal('fetch', spy)
    const received: WarningFeed[] = []
    const source = new LiveSource(1_000)
    const stop = source.subscribe((feed) => received.push(feed))
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(1_000)
    stop()
    expect(received[1].changes).toEqual([
      { kind: 'cancelled', id: 'incident-1', lastLevel: 'advice' },
    ])
  })

  it('claims no changes when it simply could not reach the feed', async () => {
    const spy = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => response })
      .mockRejectedValueOnce(new Error('offline'))
    vi.stubGlobal('fetch', spy)
    const received: WarningFeed[] = []
    const source = new LiveSource(1_000)
    const stop = source.subscribe((feed) => received.push(feed))
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(1_000)
    stop()
    // An unreachable feed is not evidence that anything was cancelled.
    expect(received[1].changes).toEqual([])
    expect(received[1].failure).toBe('network')
    expect(received[1].warnings).toHaveLength(1)
  })
})

describe('the previous snapshot travels with the changes', () => {
  it('is empty on the baseline emission', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => response }))
    const received: WarningFeed[] = []
    const source = new LiveSource(60_000)
    const stop = source.subscribe((feed) => received.push(feed))
    await vi.advanceTimersByTimeAsync(0)
    stop()
    expect(received[0].previous).toEqual([])
  })

  it('carries the warnings the diff was computed against', async () => {
    const spy = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => response })
      .mockResolvedValueOnce({ ok: true, json: async () => escalated })
    vi.stubGlobal('fetch', spy)
    const received: WarningFeed[] = []
    const source = new LiveSource(1_000)
    const stop = source.subscribe((feed) => received.push(feed))
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(1_000)
    stop()
    // The second emission's previous is the first emission's warnings, so a
    // consumer can say "changed from Advice" rather than only "changed".
    expect(received[1].previous.map((w) => w.level)).toEqual(['advice'])
    expect(received[1].warnings.map((w) => w.level)).toEqual(['watch-and-act'])
  })
})
