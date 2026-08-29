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
    },
  ],
  fetchedAt: '2026-08-29T12:00:00.000Z',
  stale: false,
  dropped: 0,
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
