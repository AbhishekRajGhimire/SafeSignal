import { describe, it, expect } from 'vitest'
import {
  areaChanged,
  changedFields,
  diffWarnings,
  escalations,
  isAnnounceable,
  type WarningChange,
} from './lifecycle'
import type { AlertLevel, LatLon, PolygonRing, Warning } from './warning'

const RETRIEVED = new Date('2026-08-30T00:00:00.000Z')

function w(
  id: string,
  level: AlertLevel,
  overrides: Partial<Warning> = {},
): Warning {
  return {
    id,
    level,
    title: 'GREEN GULLY TRAIL, KATOOMBA',
    location: 'Green Gully Trail, Katoomba',
    council: 'Blue Mountains',
    status: 'Out of control',
    type: 'Bush Fire',
    sizeHa: 120,
    agency: 'Rural Fire Service',
    updatedAt: new Date('2026-08-30T04:00:00.000Z'),
    publishedAt: new Date('2026-08-30T03:00:00.000Z'),
    point: { lat: -33.72, lon: 150.31 },
    polygons: [],
    officialUrl: 'https://www.rfs.nsw.gov.au/fire-information/fires-near-me',
    rawAdvice: null,
    fields: {},
    raw: { properties: {}, geometry: null },
    provenance: {
      source: 'nsw-rfs',
      sourceName: 'NSW Rural Fire Service',
      feedUrl: 'https://www.rfs.nsw.gov.au/feeds/majorIncidents.json',
      copyright: 'State of New South Wales (NSW Rural Fire Service)',
      retrievedAt: RETRIEVED,
      feedLastModified: null,
      transform: 'normalized',
    },
    ...overrides,
  }
}

const ring = (...pts: [number, number][]): PolygonRing =>
  pts.map(([lat, lon]): LatLon => ({ lat, lon }))

const SQUARE = ring([-33.7, 150.3], [-33.7, 150.4], [-33.8, 150.4], [-33.7, 150.3])
const BIGGER = ring([-33.6, 150.2], [-33.6, 150.5], [-33.9, 150.5], [-33.6, 150.2])

describe('new warning', () => {
  it('reports a warning that was not in the previous snapshot', () => {
    const changes = diffWarnings([], [w('a', 'advice')])
    expect(changes).toEqual([{ kind: 'new', id: 'a', level: 'advice' }])
  })

  it('reports nothing at all when both snapshots are empty', () => {
    expect(diffWarnings([], [])).toEqual([])
  })

  it('reports nothing when a warning is unchanged', () => {
    expect(diffWarnings([w('a', 'advice')], [w('a', 'advice')])).toEqual([])
  })
})

describe('changed warning level', () => {
  it('reports an escalation and marks it as one', () => {
    const changes = diffWarnings([w('a', 'advice')], [w('a', 'watch-and-act')])
    expect(changes).toEqual([
      { kind: 'level-changed', id: 'a', from: 'advice', to: 'watch-and-act', escalated: true },
    ])
  })

  it('reports a downgrade and does not mark it as an escalation', () => {
    const changes = diffWarnings([w('a', 'emergency-warning')], [w('a', 'advice')])
    expect(changes).toEqual([
      { kind: 'level-changed', id: 'a', from: 'emergency-warning', to: 'advice', escalated: false },
    ])
  })

  it('walks the full escalation ladder one step at a time', () => {
    const ladder: AlertLevel[] = ['advice', 'watch-and-act', 'emergency-warning']
    for (let i = 0; i < ladder.length - 1; i += 1) {
      const changes = diffWarnings([w('a', ladder[i])], [w('a', ladder[i + 1])])
      expect(escalations(changes)).toHaveLength(1)
    }
  })
})

describe('changed warning area', () => {
  it('reports a polygon that grew', () => {
    const before = w('a', 'advice', { polygons: [SQUARE] })
    const after = w('a', 'advice', { polygons: [BIGGER] })
    expect(areaChanged(before, after)).toBe(true)
    expect(diffWarnings([before], [after])).toEqual([{ kind: 'area-changed', id: 'a' }])
  })

  it('reports a polygon being added or removed', () => {
    const none = w('a', 'advice', { polygons: [] })
    const one = w('a', 'advice', { polygons: [SQUARE] })
    expect(areaChanged(none, one)).toBe(true)
    expect(areaChanged(one, none)).toBe(true)
  })

  it('reports the point moving', () => {
    const before = w('a', 'advice')
    const after = w('a', 'advice', { point: { lat: -33.9, lon: 150.9 } })
    expect(areaChanged(before, after)).toBe(true)
  })

  it('reports a point appearing or disappearing', () => {
    const withPoint = w('a', 'advice')
    const without = w('a', 'advice', { point: null })
    expect(areaChanged(withPoint, without)).toBe(true)
    expect(areaChanged(without, withPoint)).toBe(true)
  })

  it('does not report an identical area as changed', () => {
    const before = w('a', 'advice', { polygons: [SQUARE] })
    const after = w('a', 'advice', { polygons: [ring(...SQUARE.map((p) => [p.lat, p.lon] as [number, number]))] })
    expect(areaChanged(before, after)).toBe(false)
  })
})

describe('updated warning', () => {
  it('reports the fields that changed', () => {
    const before = w('a', 'advice')
    const after = w('a', 'advice', { status: 'Under control', sizeHa: 900 })
    const changes = diffWarnings([before], [after])
    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({ kind: 'updated', id: 'a' })
    expect((changes[0] as { fields: string[] }).fields.sort()).toEqual(['sizeHa', 'status'])
  })

  it('does not treat a new timestamp alone as an update', () => {
    const before = w('a', 'advice')
    const after = w('a', 'advice', { updatedAt: new Date('2026-08-30T09:00:00.000Z') })
    expect(changedFields(before, after)).toEqual([])
    expect(diffWarnings([before], [after])).toEqual([])
  })

  it('reports level, area, and field changes independently for one warning', () => {
    const before = w('a', 'advice', { polygons: [SQUARE] })
    const after = w('a', 'emergency-warning', { polygons: [BIGGER], status: 'Out of control 2' })
    const kinds = diffWarnings([before], [after]).map((c) => c.kind).sort()
    expect(kinds).toEqual(['area-changed', 'level-changed', 'updated'])
  })
})

describe('cancelled or expired warning', () => {
  it('reports a warning that left the feed rather than letting it vanish', () => {
    const changes = diffWarnings([w('a', 'watch-and-act')], [])
    expect(changes).toEqual([{ kind: 'cancelled', id: 'a', lastLevel: 'watch-and-act' }])
  })

  it('reports cancellation alongside other warnings continuing', () => {
    const changes = diffWarnings(
      [w('a', 'advice'), w('b', 'advice')],
      [w('b', 'advice')],
    )
    expect(changes).toEqual([{ kind: 'cancelled', id: 'a', lastLevel: 'advice' }])
  })

  it('treats a warning that leaves and returns as cancelled then new', () => {
    const gone = diffWarnings([w('a', 'advice')], [])
    const back = diffWarnings([], [w('a', 'advice')])
    expect(gone[0].kind).toBe('cancelled')
    expect(back[0].kind).toBe('new')
  })
})

describe('announceability', () => {
  it('announces arrivals, level changes and cancellations', () => {
    const announce: WarningChange[] = [
      { kind: 'new', id: 'a', level: 'advice' },
      { kind: 'cancelled', id: 'a', lastLevel: 'advice' },
      { kind: 'level-changed', id: 'a', from: 'advice', to: 'watch-and-act', escalated: true },
    ]
    for (const change of announce) expect(isAnnounceable(change), change.kind).toBe(true)
  })

  it('does not interrupt a person for a size or area change alone', () => {
    expect(isAnnounceable({ kind: 'updated', id: 'a', fields: ['sizeHa'] })).toBe(false)
    expect(isAnnounceable({ kind: 'area-changed', id: 'a' })).toBe(false)
  })
})

describe('many warnings at once', () => {
  it('handles arrivals, escalations and cancellations in one comparison', () => {
    const previous = [w('a', 'advice'), w('b', 'watch-and-act'), w('c', 'advice')]
    const next = [w('a', 'emergency-warning'), w('c', 'advice'), w('d', 'advice')]
    const changes = diffWarnings(previous, next)
    expect(changes).toContainEqual({
      kind: 'level-changed', id: 'a', from: 'advice', to: 'emergency-warning', escalated: true,
    })
    expect(changes).toContainEqual({ kind: 'new', id: 'd', level: 'advice' })
    expect(changes).toContainEqual({ kind: 'cancelled', id: 'b', lastLevel: 'watch-and-act' })
    expect(changes.filter((c) => c.id === 'c')).toEqual([])
  })
})
