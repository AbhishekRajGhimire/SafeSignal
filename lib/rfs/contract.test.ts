import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { normalizeFeed, type FeedContext } from './normalize'
import { validateFeed } from './validate'

/**
 * Contract test against a real snapshot of the NSW RFS feed, captured
 * 2026-08-30 from https://www.rfs.nsw.gov.au/feeds/majorIncidents.json
 *
 * This is the test that fails if the RFS changes the feed shape. Everything
 * else in the suite tests our own assumptions about that shape; this one
 * tests the assumptions against something the RFS actually sent.
 */

const snapshot = JSON.parse(
  readFileSync(fileURLToPath(new URL('./__fixtures__/live-feed-2026-08-30.json', import.meta.url)), 'utf8'),
)

const CONTEXT: FeedContext = {
  retrievedAt: new Date('2026-08-30T00:00:00.000Z'),
  feedLastModified: new Date('2026-08-29T15:16:44.000Z'),
}

describe('the captured feed itself', () => {
  it('is a valid FeatureCollection', () => {
    expect(validateFeed(snapshot).ok).toBe(true)
  })

  it('carries the nine structured description fields and no prose', () => {
    // Verified across the whole live feed on 2026-08-30. If the RFS ever adds
    // free-text advice, this test fails and the AI translation layer finally
    // has real input to work on.
    for (const feature of snapshot.features) {
      const description = feature.properties.description as string
      const keys = description
        .split(/<br\s*\/?>/i)
        .map((s: string) => s.split(':')[0].trim().toUpperCase())
        .filter(Boolean)
      expect(keys).toEqual([
        'ALERT LEVEL', 'LOCATION', 'COUNCIL AREA', 'STATUS',
        'TYPE', 'FIRE', 'SIZE', 'RESPONSIBLE AGENCY', 'UPDATED',
      ])
    }
  })

  it('uses a guid that is a stable per-incident permalink', () => {
    for (const feature of snapshot.features) {
      expect(feature.properties.guid).toMatch(
        /^https:\/\/incidents\.rfs\.nsw\.gov\.au\/api\/v1\/incidents\/\d+$/,
      )
      expect(feature.properties.guid_isPermaLink).toBe('true')
    }
  })

  it('points every link at the same generic map page', () => {
    // The guid is per-incident but requires authorization (401), so there is
    // no per-warning page we can send a user to.
    const links = new Set(snapshot.features.map((f: { properties: { link: string } }) => f.properties.link))
    expect(links.size).toBe(1)
  })

  it('nests polygons two levels deep inside a GeometryCollection', () => {
    const nested = snapshot.features.filter(
      (f: { geometry?: { type?: string; geometries?: { type?: string }[] } }) =>
        f.geometry?.type === 'GeometryCollection' &&
        f.geometry.geometries?.some((g) => g.type === 'GeometryCollection'),
    )
    expect(nested.length).toBeGreaterThan(0)
  })
})

describe('the pipeline against the captured feed', () => {
  const result = normalizeFeed(snapshot, CONTEXT)

  it('normalizes every feature without dropping any', () => {
    expect(result.rejected).toBeNull()
    expect(result.dropped).toBe(0)
    expect(result.duplicates).toBe(0)
    expect(result.warnings).toHaveLength(snapshot.features.length)
  })

  it('extracts polygon rings through the nested GeometryCollection', () => {
    const rings = result.warnings.reduce((n, w) => n + w.polygons.length, 0)
    expect(rings).toBeGreaterThan(0)
  })

  it('reads coordinates as [lon, lat] and lands them in New South Wales', () => {
    for (const warning of result.warnings) {
      expect(warning.point).not.toBeNull()
      // NSW spans roughly 28S-37S, 141E-154E. Reversing lat/lon would put
      // these in Kazakhstan, which is exactly the bug this guards.
      expect(warning.point!.lat).toBeLessThan(-25)
      expect(warning.point!.lat).toBeGreaterThan(-38)
      expect(warning.point!.lon).toBeGreaterThan(140)
      expect(warning.point!.lon).toBeLessThan(155)
    }
  })

  it('parses every timestamp as Sydney local time', () => {
    for (const warning of result.warnings) {
      expect(warning.updatedAt, warning.id).not.toBeNull()
      expect(warning.publishedAt, warning.id).not.toBeNull()
    }
  })

  it('gives every warning a unique id and full provenance', () => {
    const ids = result.warnings.map((w) => w.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const warning of result.warnings) {
      expect(warning.provenance.source).toBe('nsw-rfs')
      expect(warning.provenance.retrievedAt).toEqual(CONTEXT.retrievedAt)
      expect(warning.raw.properties.guid).toBe(warning.id)
    }
  })

  it('maps every category the feed emits onto a known level', () => {
    for (const warning of result.warnings) {
      expect(warning.level).not.toBe(undefined)
      expect(['advice', 'planned-burn', 'not-applicable', 'watch-and-act', 'emergency-warning'])
        .toContain(warning.level)
    }
  })

  it('leaves rawAdvice null, because the feed contains no advice prose', () => {
    for (const warning of result.warnings) {
      expect(warning.rawAdvice).toBeNull()
    }
  })
})
