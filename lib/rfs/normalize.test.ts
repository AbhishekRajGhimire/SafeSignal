import { describe, it, expect } from 'vitest'
import { normalizeFeature, normalizeFeed } from './normalize'

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
    const w = normalizeFeature(pointFeature)!
    expect(w.id).toBe('https://incidents.rfs.nsw.gov.au/api/v1/incidents/673192')
    expect(w.level).toBe('advice')
    expect(w.title).toBe('ALTINIER RD, TUNCESTER')
    expect(w.council).toBe('Lismore')
    expect(w.status).toBe('Under control')
    expect(w.sizeHa).toBe(0)
    expect(w.updatedAt?.toISOString()).toBe('2026-08-29T04:12:00.000Z')
  })

  it('reads GeoJSON coordinates as [lon, lat], not [lat, lon]', () => {
    const w = normalizeFeature(pointFeature)!
    expect(w.point).toEqual({ lat: -28.807605556, lon: 153.209163148 })
  })

  it('maps every category to its alert level', () => {
    const level = (category: string) =>
      normalizeFeature({ ...pointFeature, properties: { ...pointFeature.properties, category } })!.level
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
    })!
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
    })!
    expect(w.point).toEqual({ lat: -28.8, lon: 153.2 })
    expect(w.polygons).toHaveLength(1)
    expect(w.polygons[0][0]).toEqual({ lat: -28.0, lon: 153.0 })
  })

  it('returns null rather than throwing on junk', () => {
    expect(normalizeFeature(null)).toBeNull()
    expect(normalizeFeature({})).toBeNull()
    expect(normalizeFeature({ properties: {} })).toBeNull()
  })

  it('survives a feature with no geometry at all', () => {
    const w = normalizeFeature({ ...pointFeature, geometry: null })!
    expect(w.point).toBeNull()
    expect(w.polygons).toEqual([])
  })
})

describe('normalizeFeed', () => {
  it('counts what it drops instead of throwing', () => {
    const result = normalizeFeed({
      type: 'FeatureCollection',
      features: [pointFeature, null, { nonsense: true }],
    })
    expect(result.warnings).toHaveLength(1)
    expect(result.dropped).toBe(2)
  })

  it('returns empty rather than throwing when the payload is not a feed', () => {
    expect(normalizeFeed(null)).toEqual({ warnings: [], dropped: 0 })
    expect(normalizeFeed({ nope: 1 })).toEqual({ warnings: [], dropped: 0 })
  })
})
