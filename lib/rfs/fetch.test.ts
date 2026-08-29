import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getFeed, __resetFeedCacheForTests } from './fetch'

const feedPayload = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [153.2, -28.8] },
      properties: {
        title: 'TEST FIRE',
        link: 'https://example.invalid',
        category: 'Advice',
        guid: 'incident-1',
        pubDate: '29/08/2026 4:12:00 AM',
        description: 'ALERT LEVEL: Advice <br />STATUS: Under control',
      },
    },
  ],
}

function mockFetchOnce(ok: boolean, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 502,
    json: async () => body,
  })
}

beforeEach(() => {
  __resetFeedCacheForTests()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-08-29T12:00:00.000Z'))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('getFeed', () => {
  it('fetches and normalizes the feed', async () => {
    vi.stubGlobal('fetch', mockFetchOnce(true, feedPayload))
    const snapshot = await getFeed()
    expect(snapshot.warnings).toHaveLength(1)
    expect(snapshot.stale).toBe(false)
    expect(snapshot.fetchedAt?.toISOString()).toBe('2026-08-29T12:00:00.000Z')
  })

  it('serves the cache without refetching inside the 30 second window', async () => {
    const fetchMock = mockFetchOnce(true, feedPayload)
    vi.stubGlobal('fetch', fetchMock)
    await getFeed()
    vi.setSystemTime(new Date('2026-08-29T12:00:20.000Z'))
    await getFeed()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('refetches once the cache window has passed', async () => {
    const fetchMock = mockFetchOnce(true, feedPayload)
    vi.stubGlobal('fetch', fetchMock)
    await getFeed()
    vi.setSystemTime(new Date('2026-08-29T12:00:31.000Z'))
    await getFeed()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('serves the last good payload marked stale when the upstream fails', async () => {
    vi.stubGlobal('fetch', mockFetchOnce(true, feedPayload))
    await getFeed()

    vi.setSystemTime(new Date('2026-08-29T12:01:00.000Z'))
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    const snapshot = await getFeed()

    expect(snapshot.warnings).toHaveLength(1)
    expect(snapshot.stale).toBe(true)
    expect(snapshot.fetchedAt?.toISOString()).toBe('2026-08-29T12:00:00.000Z')
  })

  it('returns an empty stale snapshot when it fails with nothing cached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    const snapshot = await getFeed()
    expect(snapshot.warnings).toEqual([])
    expect(snapshot.stale).toBe(true)
    expect(snapshot.fetchedAt).toBeNull()
  })

  it('treats a non-ok response as a failure', async () => {
    vi.stubGlobal('fetch', mockFetchOnce(false, {}))
    const snapshot = await getFeed()
    expect(snapshot.stale).toBe(true)
  })
})
