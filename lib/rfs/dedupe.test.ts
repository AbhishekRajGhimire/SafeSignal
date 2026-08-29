import { describe, it, expect } from 'vitest'
import { dedupeWarnings } from './dedupe'
import type { Warning } from '@/lib/domain/warning'

function w(id: string, updatedAt: string | null, status = 'Out of control'): Warning {
  return {
    id,
    level: 'advice',
    title: 'T',
    location: 'L',
    council: 'C',
    status,
    type: 'Bush Fire',
    sizeHa: 1,
    agency: 'Rural Fire Service',
    updatedAt: updatedAt ? new Date(updatedAt) : null,
    publishedAt: null,
    point: null,
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
      retrievedAt: new Date('2026-08-30T00:00:00.000Z'),
      feedLastModified: null,
      transform: 'normalized',
    },
  }
}

describe('dedupeWarnings', () => {
  it('leaves a feed with no duplicates untouched', () => {
    const input = [w('a', '2026-08-30T01:00:00Z'), w('b', '2026-08-30T01:00:00Z')]
    const result = dedupeWarnings(input)
    expect(result.duplicates).toBe(0)
    expect(result.warnings.map((x) => x.id)).toEqual(['a', 'b'])
  })

  it('collapses a repeated id and counts it', () => {
    const result = dedupeWarnings([w('a', '2026-08-30T01:00:00Z'), w('a', '2026-08-30T01:00:00Z')])
    expect(result.warnings).toHaveLength(1)
    expect(result.duplicates).toBe(1)
  })

  it('keeps the most recently updated record', () => {
    const result = dedupeWarnings([
      w('a', '2026-08-30T01:00:00Z', 'old'),
      w('a', '2026-08-30T05:00:00Z', 'new'),
    ])
    expect(result.warnings[0].status).toBe('new')
  })

  it('does not let an older record displace a newer one', () => {
    const result = dedupeWarnings([
      w('a', '2026-08-30T05:00:00Z', 'new'),
      w('a', '2026-08-30T01:00:00Z', 'old'),
    ])
    expect(result.warnings[0].status).toBe('new')
  })

  it('prefers a timestamped record over one with no timestamp', () => {
    expect(dedupeWarnings([w('a', null, 'undated'), w('a', '2026-08-30T01:00:00Z', 'dated')])
      .warnings[0].status).toBe('dated')
    expect(dedupeWarnings([w('a', '2026-08-30T01:00:00Z', 'dated'), w('a', null, 'undated')])
      .warnings[0].status).toBe('dated')
  })

  it('preserves feed order, which carries the publisher ranking', () => {
    const result = dedupeWarnings([w('c', null), w('a', null), w('b', null), w('a', null)])
    expect(result.warnings.map((x) => x.id)).toEqual(['c', 'a', 'b'])
  })

  it('counts every extra occurrence, not just the first repeat', () => {
    const result = dedupeWarnings([w('a', null), w('a', null), w('a', null)])
    expect(result.warnings).toHaveLength(1)
    expect(result.duplicates).toBe(2)
  })

  it('handles an empty feed', () => {
    expect(dedupeWarnings([])).toEqual({ warnings: [], duplicates: 0 })
  })
})
