import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getFeed, __resetFeedCacheForTests, FEED_URL } from './fetch'

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

function headers(map: Record<string, string> = {}) {
  return { get: (k: string) => map[k.toLowerCase()] ?? null }
}

function respond(
  status: number,
  body: unknown,
  headerMap: Record<string, string> = {},
) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: headers(headerMap),
    json: async () => body,
  }
}

beforeEach(() => {
  __resetFeedCacheForTests()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-08-30T00:00:00.000Z'))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('successful retrieval', () => {
  it('normalizes the feed and reports it as not stale', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(200, feedPayload)))
    const snapshot = await getFeed()
    expect(snapshot.warnings).toHaveLength(1)
    expect(snapshot.stale).toBe(false)
    expect(snapshot.failure).toBeNull()
    expect(snapshot.fetchedAt).toEqual(new Date('2026-08-30T00:00:00.000Z'))
  })

  it('records the feed Last-Modified when the response supplies one', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        respond(200, feedPayload, { 'last-modified': 'Sat, 29 Aug 2026 15:16:44 GMT' }),
      ),
    )
    const snapshot = await getFeed()
    expect(snapshot.feedLastModified).toEqual(new Date('2026-08-29T15:16:44.000Z'))
    expect(snapshot.warnings[0].provenance.feedLastModified).not.toBeNull()
  })

  it('applies an abort signal so a hung feed cannot stall the request', async () => {
    const spy = vi.fn().mockResolvedValue(respond(200, feedPayload))
    vi.stubGlobal('fetch', spy)
    await getFeed()
    expect(spy).toHaveBeenCalledWith(FEED_URL, expect.objectContaining({ signal: expect.anything() }))
  })
})

describe('caching and conditional requests', () => {
  it('serves the cache within the 30 second window without refetching', async () => {
    const spy = vi.fn().mockResolvedValue(respond(200, feedPayload))
    vi.stubGlobal('fetch', spy)
    await getFeed()
    vi.setSystemTime(new Date('2026-08-30T00:00:20.000Z'))
    await getFeed()
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('refetches once the window has passed', async () => {
    const spy = vi.fn().mockResolvedValue(respond(200, feedPayload))
    vi.stubGlobal('fetch', spy)
    await getFeed()
    vi.setSystemTime(new Date('2026-08-30T00:00:31.000Z'))
    await getFeed()
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('sends the stored validators on the next request', async () => {
    const spy = vi
      .fn()
      .mockResolvedValueOnce(
        respond(200, feedPayload, { etag: '"abc"', 'last-modified': 'Sat, 29 Aug 2026 15:16:44 GMT' }),
      )
      .mockResolvedValueOnce(respond(304, null))
    vi.stubGlobal('fetch', spy)
    await getFeed()
    vi.setSystemTime(new Date('2026-08-30T00:00:31.000Z'))
    await getFeed()
    const sent = spy.mock.calls[1][1].headers
    expect(sent['if-none-match']).toBe('"abc"')
    expect(sent['if-modified-since']).toBe('Sat, 29 Aug 2026 15:16:44 GMT')
  })

  it('treats 304 Not Modified as a confirmed read and restarts the clock', async () => {
    const spy = vi
      .fn()
      .mockResolvedValueOnce(respond(200, feedPayload, { etag: '"abc"' }))
      .mockResolvedValueOnce(respond(304, null))
    vi.stubGlobal('fetch', spy)
    await getFeed()
    vi.setSystemTime(new Date('2026-08-30T00:00:31.000Z'))
    const snapshot = await getFeed()
    expect(snapshot.stale).toBe(false)
    expect(snapshot.failure).toBeNull()
    expect(snapshot.warnings).toHaveLength(1)
    expect(snapshot.fetchedAt).toEqual(new Date('2026-08-30T00:00:31.000Z'))
  })
})

describe('feed failure handling', () => {
  it('serves the last good payload, flagged stale, when the network fails', async () => {
    const spy = vi
      .fn()
      .mockResolvedValueOnce(respond(200, feedPayload))
      .mockRejectedValueOnce(new Error('offline'))
    vi.stubGlobal('fetch', spy)
    await getFeed()
    vi.setSystemTime(new Date('2026-08-30T00:00:31.000Z'))
    const snapshot = await getFeed()
    expect(snapshot.warnings).toHaveLength(1)
    expect(snapshot.stale).toBe(true)
    expect(snapshot.failure).toBe('network')
  })

  it('distinguishes a timeout from a generic network failure', async () => {
    const timeout = Object.assign(new Error('timed out'), { name: 'TimeoutError' })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(timeout))
    const snapshot = await getFeed()
    expect(snapshot.failure).toBe('timeout')
  })

  it('reports an HTTP error without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(502, null)))
    const snapshot = await getFeed()
    expect(snapshot.failure).toBe('http-error')
    expect(snapshot.warnings).toEqual([])
  })

  it('reports unparseable JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: headers(),
        json: async () => {
          throw new SyntaxError('bad json')
        },
      }),
    )
    const snapshot = await getFeed()
    expect(snapshot.failure).toBe('invalid-json')
  })

  it('reports a schema rejection and names the reason', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond(200, { type: 'Feature', features: [] })))
    const snapshot = await getFeed()
    expect(snapshot.failure).toBe('invalid-schema:wrong-collection-type')
  })

  it('never throws and never returns undefined warnings, whatever happens', async () => {
    for (const stub of [
      vi.fn().mockRejectedValue(new Error('x')),
      vi.fn().mockResolvedValue(respond(500, null)),
      vi.fn().mockResolvedValue(respond(200, 'not a feed')),
    ]) {
      __resetFeedCacheForTests()
      vi.stubGlobal('fetch', stub)
      const snapshot = await getFeed()
      expect(Array.isArray(snapshot.warnings)).toBe(true)
    }
  })
})

describe('stale-data detection', () => {
  it('marks a degraded read stale and a live read fresh', async () => {
    const spy = vi
      .fn()
      .mockResolvedValueOnce(respond(200, feedPayload))
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(respond(200, feedPayload))
    vi.stubGlobal('fetch', spy)

    expect((await getFeed()).stale).toBe(false)
    vi.setSystemTime(new Date('2026-08-30T00:01:00.000Z'))
    expect((await getFeed()).stale).toBe(true)
    vi.setSystemTime(new Date('2026-08-30T00:02:00.000Z'))
    expect((await getFeed()).stale).toBe(false)
  })

  it('reports an empty unavailable feed when nothing has ever succeeded', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    const snapshot = await getFeed()
    expect(snapshot.warnings).toEqual([])
    expect(snapshot.fetchedAt).toBeNull()
    expect(snapshot.stale).toBe(true)
  })
})
