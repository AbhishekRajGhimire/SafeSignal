import { describe, it, expect } from 'vitest'
import { normalizeFeature, normalizeFeed, FEED_SOURCE, type FeedContext } from './normalize'

const CONTEXT: FeedContext = {
  retrievedAt: new Date('2026-08-30T00:00:00.000Z'),
  feedLastModified: new Date('2026-08-29T15:16:44.000Z'),
}

const description = [
  'ALERT LEVEL: Advice ',
  'LOCATION: ALTINIER RD, TUNCESTER 2480 ',
  'COUNCIL AREA: Lismore ',
  'STATUS: Under control ',
  'TYPE: Grass Fire ',
  'FIRE: Yes ',
  'SIZE: 0 ha ',
  'RESPONSIBLE AGENCY: Rural Fire Service ',
  'UPDATED: 29 Aug 2026 14:12',
].join('<br />')

const pointFeature = {
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [153.209163148, -28.807605556] },
  properties: {
    title: 'ALTINIER RD, TUNCESTER',
    link: 'https://www.rfs.nsw.gov.au/fire-information/fires-near-me',
    category: 'Advice',
    guid: 'https://incidents.rfs.nsw.gov.au/api/v1/incidents/673192',
    pubDate: '29/08/2026 4:12:00 AM',
    description,
  },
}

describe('normalizeFeature', () => {
  it('maps every parsed field onto the Warning', () => {
    const w = normalizeFeature(pointFeature, CONTEXT)!
    expect(w.id).toBe('https://incidents.rfs.nsw.gov.au/api/v1/incidents/673192')
    expect(w.level).toBe('advice')
    expect(w.title).toBe('ALTINIER RD, TUNCESTER')
    expect(w.council).toBe('Lismore')
    expect(w.status).toBe('Under control')
    expect(w.sizeHa).toBe(0)
    expect(w.updatedAt?.toISOString()).toBe('2026-08-29T04:12:00.000Z')
  })

  it('reads GeoJSON coordinates as [lon, lat], not [lat, lon]', () => {
    const w = normalizeFeature(pointFeature, CONTEXT)!
    expect(w.point).toEqual({ lat: -28.807605556, lon: 153.209163148 })
  })

  it('maps every category to its alert level', () => {
    const level = (category: string) =>
      normalizeFeature({ ...pointFeature, properties: { ...pointFeature.properties, category } }, CONTEXT)!.level
    expect(level('Emergency Warning')).toBe('emergency-warning')
    expect(level('Watch and Act')).toBe('watch-and-act')
    expect(level('Advice')).toBe('advice')
    expect(level('Planned Burn')).toBe('planned-burn')
    expect(level('Not Applicable')).toBe('not-applicable')
  })

  it('falls back to not-applicable for an unrecognised category', () => {
    const w = normalizeFeature({
      ...pointFeature,
      properties: { ...pointFeature.properties, category: 'Something New' },
    }, CONTEXT)!
    expect(w.level).toBe('not-applicable')
  })

  it('pulls the point and every polygon out of a nested GeometryCollection', () => {
    const w = normalizeFeature({
      ...pointFeature,
      geometry: {
        type: 'GeometryCollection',
        geometries: [
          { type: 'Point', coordinates: [153.2, -28.8] },
          {
            type: 'GeometryCollection',
            geometries: [
              { type: 'Polygon', coordinates: [[[153.0, -28.0], [153.1, -28.0], [153.1, -28.1], [153.0, -28.0]]] },
            ],
          },
        ],
      },
    }, CONTEXT)!
    expect(w.point).toEqual({ lat: -28.8, lon: 153.2 })
    expect(w.polygons).toHaveLength(1)
    expect(w.polygons[0][0]).toEqual({ lat: -28.0, lon: 153.0 })
  })

  it('returns null rather than throwing on junk', () => {
    expect(normalizeFeature(null, CONTEXT)).toBeNull()
    expect(normalizeFeature({}, CONTEXT)).toBeNull()
    expect(normalizeFeature({ properties: {} }, CONTEXT)).toBeNull()
  })

  it('survives a feature with no geometry at all', () => {
    const w = normalizeFeature({ ...pointFeature, geometry: null }, CONTEXT)!
    expect(w.point).toBeNull()
    expect(w.polygons).toEqual([])
  })
})

describe('normalizeFeed', () => {
  it('counts what it drops instead of throwing', () => {
    const result = normalizeFeed({
      type: 'FeatureCollection',
      features: [pointFeature, null, { nonsense: true }],
    }, CONTEXT)
    expect(result.warnings).toHaveLength(1)
    expect(result.dropped).toBe(2)
  })

  it('rejects a payload that is not a feed, rather than reporting it as empty', () => {
    // The distinction matters: an empty feed means "no current incidents",
    // a rejected one means "trust nothing you just received".
    expect(normalizeFeed(null, CONTEXT).rejected).toBe('not-an-object')
    expect(normalizeFeed({ nope: 1 }, CONTEXT).rejected).toBe('features-missing')
    expect(normalizeFeed('<html>', CONTEXT).rejected).toBe('not-an-object')
  })

  it('reports an empty feed as valid with no warnings', () => {
    const result = normalizeFeed({ type: 'FeatureCollection', features: [] }, CONTEXT)
    expect(result.rejected).toBeNull()
    expect(result.warnings).toEqual([])
  })

  it('collapses a repeated incident id and counts it', () => {
    const result = normalizeFeed(
      { type: 'FeatureCollection', features: [pointFeature, pointFeature] },
      CONTEXT,
    )
    expect(result.warnings).toHaveLength(1)
    expect(result.duplicates).toBe(1)
  })
})

describe('provenance and raw source retention', () => {
  it('attributes every warning to the official source', () => {
    const w = normalizeFeature(pointFeature, CONTEXT)!
    expect(w.provenance.source).toBe('nsw-rfs')
    expect(w.provenance.sourceName).toBe(FEED_SOURCE.sourceName)
    expect(w.provenance.feedUrl).toBe(FEED_SOURCE.feedUrl)
    expect(w.provenance.copyright).toContain('New South Wales')
    expect(w.provenance.transform).toBe('normalized')
  })

  it('records when the payload was retrieved and when the feed last changed', () => {
    const w = normalizeFeature(pointFeature, CONTEXT)!
    expect(w.provenance.retrievedAt).toEqual(CONTEXT.retrievedAt)
    expect(w.provenance.feedLastModified).toEqual(CONTEXT.feedLastModified)
  })

  it('keeps the source record verbatim, separate from the transformed warning', () => {
    const w = normalizeFeature(pointFeature, CONTEXT)!
    expect(w.raw.properties.guid).toBe(pointFeature.properties.guid)
    expect(w.raw.properties.description).toBe(pointFeature.properties.description)
    expect(w.raw.geometry).toEqual(pointFeature.geometry)
  })

  it('does not let mutating the raw record change the source feature', () => {
    const w = normalizeFeature(pointFeature, CONTEXT)!
    ;(w.raw.properties as Record<string, unknown>).title = 'TAMPERED'
    expect(pointFeature.properties.title).toBe('ALTINIER RD, TUNCESTER')
  })

  it('retains every description field, including ones it does not model', () => {
    const w = normalizeFeature(pointFeature, CONTEXT)!
    // FIRE has no place on the Warning type but must survive for the
    // official-wording block, which shows the feed's own text.
    expect(w.fields.FIRE).toBe('Yes')
    expect(Object.keys(w.fields)).toEqual([
      'ALERT LEVEL', 'LOCATION', 'COUNCIL AREA', 'STATUS',
      'TYPE', 'FIRE', 'SIZE', 'RESPONSIBLE AGENCY', 'UPDATED',
    ])
  })

  it('preserves an unknown field the RFS might add later', () => {
    const feature = {
      ...pointFeature,
      properties: {
        ...pointFeature.properties,
        description: pointFeature.properties.description + '<br />NEW FIELD: something',
      },
    }
    const w = normalizeFeature(feature, CONTEXT)!
    expect(w.fields['NEW FIELD']).toBe('something')
  })

  it('never invents advice: rawAdvice stays null because the feed carries none', () => {
    const w = normalizeFeature(pointFeature, CONTEXT)!
    expect(w.rawAdvice).toBeNull()
  })
})
