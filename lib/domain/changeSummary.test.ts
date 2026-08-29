import { describe, it, expect } from 'vitest'
import { hasConfidentDescription, summariseWarningChange } from './changeSummary'
import { makeWarning } from '@/lib/testing/fixtures'
import type { PolygonRing } from './warning'

const SQUARE: PolygonRing = [
  { lat: -33.8, lon: 150.2 }, { lat: -33.8, lon: 150.4 },
  { lat: -33.6, lon: 150.4 }, { lat: -33.6, lon: 150.2 }, { lat: -33.8, lon: 150.2 },
]
const BIGGER: PolygonRing = [
  { lat: -33.9, lon: 150.1 }, { lat: -33.9, lon: 150.5 },
  { lat: -33.5, lon: 150.5 }, { lat: -33.5, lon: 150.1 }, { lat: -33.9, lon: 150.1 },
]

describe('warning level changes', () => {
  it('names an escalation with both official levels', () => {
    const details = summariseWarningChange(
      makeWarning({ level: 'advice' }),
      makeWarning({ level: 'emergency-warning' }),
    )
    expect(details).toEqual([
      { kind: 'level', from: 'advice', to: 'emergency-warning', escalated: true },
    ])
  })

  it('names a downgrade without calling it an escalation', () => {
    const details = summariseWarningChange(
      makeWarning({ level: 'watch-and-act' }),
      makeWarning({ level: 'advice' }),
    )
    expect(details).toEqual([
      { kind: 'level', from: 'watch-and-act', to: 'advice', escalated: false },
    ])
  })
})

describe('status changes', () => {
  it('states both statuses when it holds both', () => {
    const details = summariseWarningChange(
      makeWarning({ status: 'Being controlled' }),
      makeWarning({ status: 'Out of control' }),
    )
    expect(details).toEqual([
      { kind: 'status', from: 'Being controlled', to: 'Out of control' },
    ])
  })

  it('falls back to unspecified when one side is empty', () => {
    const details = summariseWarningChange(
      makeWarning({ status: '' }),
      makeWarning({ status: 'Out of control' }),
    )
    expect(details).toEqual([{ kind: 'unspecified' }])
    expect(hasConfidentDescription(details)).toBe(false)
  })
})

describe('size changes', () => {
  it('states both sizes when it holds both', () => {
    const details = summariseWarningChange(
      makeWarning({ sizeHa: 120 }),
      makeWarning({ sizeHa: 840 }),
    )
    expect(details).toEqual([{ kind: 'size', fromHa: 120, toHa: 840 }])
  })

  it('falls back to unspecified when a size is missing on either side', () => {
    expect(summariseWarningChange(
      makeWarning({ sizeHa: null }),
      makeWarning({ sizeHa: 840 }),
    )).toEqual([{ kind: 'unspecified' }])
    expect(summariseWarningChange(
      makeWarning({ sizeHa: 120 }),
      makeWarning({ sizeHa: null }),
    )).toEqual([{ kind: 'unspecified' }])
  })
})

describe('area changes', () => {
  it('reports the area as changed, never as a direction or a trend', () => {
    const details = summariseWarningChange(
      makeWarning({ polygons: [SQUARE] }),
      makeWarning({ polygons: [BIGGER] }),
    )
    expect(details).toEqual([{ kind: 'area' }])
    // The detail carries no vector, no growth flag, nothing to build
    // "moving towards you" from.
    expect(Object.keys(details[0])).toEqual(['kind'])
  })

  it('reports a polygon appearing as an area change', () => {
    expect(summariseWarningChange(
      makeWarning({ polygons: [] }),
      makeWarning({ polygons: [SQUARE] }),
    )).toEqual([{ kind: 'area' }])
  })
})

describe('timestamp-only changes', () => {
  it('reports a refreshed official time when nothing else changed', () => {
    const later = new Date('2026-08-30T06:00:00.000Z')
    const details = summariseWarningChange(
      makeWarning({ updatedAt: new Date('2026-08-30T04:00:00.000Z') }),
      makeWarning({ updatedAt: later }),
    )
    expect(details).toEqual([{ kind: 'time', updatedAt: later }])
  })

  it('does not report time when a real change is already named', () => {
    const details = summariseWarningChange(
      makeWarning({ status: 'Being controlled', updatedAt: new Date('2026-08-30T04:00:00.000Z') }),
      makeWarning({ status: 'Out of control', updatedAt: new Date('2026-08-30T06:00:00.000Z') }),
    )
    expect(details.map((d) => d.kind)).toEqual(['status'])
  })
})

describe('changes that cannot be confidently described', () => {
  it('reports a changed location as unspecified rather than guessing', () => {
    const details = summariseWarningChange(
      makeWarning({ location: 'Green Gully Trail, Katoomba' }),
      makeWarning({ location: 'Somewhere else entirely' }),
    )
    expect(details).toEqual([{ kind: 'unspecified' }])
  })

  it('keeps confident details alongside the unspecified marker', () => {
    const details = summariseWarningChange(
      makeWarning({ level: 'advice', council: 'Blue Mountains' }),
      makeWarning({ level: 'watch-and-act', council: 'Lithgow' }),
    )
    expect(details.map((d) => d.kind).sort()).toEqual(['level', 'unspecified'])
    expect(hasConfidentDescription(details)).toBe(true)
  })
})

describe('edges', () => {
  it('claims nothing about a warning with no predecessor', () => {
    expect(summariseWarningChange(null, makeWarning())).toEqual([])
    expect(summariseWarningChange(undefined, makeWarning())).toEqual([])
  })

  it('claims nothing when nothing changed', () => {
    expect(summariseWarningChange(makeWarning(), makeWarning())).toEqual([])
  })

  it('names every change at once when several things changed together', () => {
    const details = summariseWarningChange(
      makeWarning({ level: 'advice', status: 'Being controlled', sizeHa: 12, polygons: [SQUARE] }),
      makeWarning({ level: 'emergency-warning', status: 'Out of control', sizeHa: 840, polygons: [BIGGER] }),
    )
    expect(details.map((d) => d.kind).sort()).toEqual(['area', 'level', 'size', 'status'])
  })
})
