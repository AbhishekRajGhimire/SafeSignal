import { describe, it, expect } from 'vitest'
import { describeChange, isEscalation, screenStateFrom, significantChanges } from './screenState'
import type { ScreenInput } from './screenState'
import type { LocationAssessment, Verdict, VerdictReason } from './relevance'
import type { Freshness } from './freshness'
import type { WarningChange } from './lifecycle'

function assessment(
  verdict: Verdict,
  reason: VerdictReason = 'outside-polygon',
  freshness: Freshness = 'fresh',
): LocationAssessment {
  return { verdict, reason, affected: [], undetermined: [], nearby: [], all: [], freshness }
}

const input = (over: Partial<ScreenInput> = {}): ScreenInput => ({
  ready: true,
  hasLocation: true,
  assessment: assessment('not-currently-affected'),
  changes: [],
  failure: null,
  ...over,
})

const escalation: WarningChange = {
  kind: 'level-changed', id: 'a', from: 'advice', to: 'emergency-warning', escalated: true,
}

describe('loading state', () => {
  it('is loading until the profile has been read', () => {
    expect(screenStateFrom(input({ ready: false }))).toBe('loading')
  })

  it('stays loading even when a warning is already present', () => {
    expect(screenStateFrom(input({ ready: false, assessment: assessment('affected') })))
      .toBe('loading')
  })
})

describe('warning state', () => {
  it('shows a warning when the location is affected', () => {
    expect(screenStateFrom(input({ assessment: assessment('affected') }))).toBe('warning')
  })

  it('outranks a stale feed', () => {
    expect(screenStateFrom(input({
      assessment: assessment('affected', 'inside-polygon', 'stale'),
    }))).toBe('warning')
  })

  it('outranks a failed poll', () => {
    expect(screenStateFrom(input({
      assessment: assessment('affected'),
      failure: 'network',
    }))).toBe('warning')
  })

  it('outranks a missing location, because containment was already decided', () => {
    expect(screenStateFrom(input({
      assessment: assessment('affected'),
      hasLocation: false,
    }))).toBe('warning')
  })
})

describe('warning-updated state', () => {
  it('marks a warning as updated when the level changed', () => {
    expect(screenStateFrom(input({
      assessment: assessment('affected'),
      changes: [escalation],
    }))).toBe('warning-updated')
  })

  it('marks a warning as updated when a new warning arrived', () => {
    expect(screenStateFrom(input({
      assessment: assessment('affected'),
      changes: [{ kind: 'new', id: 'b', level: 'advice' }],
    }))).toBe('warning-updated')
  })

  it('does not take over the screen for a size or area change alone', () => {
    expect(screenStateFrom(input({
      assessment: assessment('affected'),
      changes: [{ kind: 'updated', id: 'a', fields: ['sizeHa'] }, { kind: 'area-changed', id: 'a' }],
    }))).toBe('warning')
  })
})

describe('location-error state', () => {
  it('names a missing location directly rather than as a generic unknown', () => {
    expect(screenStateFrom(input({
      hasLocation: false,
      assessment: assessment('undetermined', 'no-location'),
    }))).toBe('location-error')
  })

  it('takes precedence over a feed error, being the fixable one', () => {
    expect(screenStateFrom(input({
      hasLocation: false,
      assessment: assessment('unavailable', 'no-warning-data'),
      failure: 'network',
    }))).toBe('location-error')
  })
})

describe('feed-error state', () => {
  it('reports unavailable warning data', () => {
    expect(screenStateFrom(input({ assessment: assessment('unavailable', 'no-warning-data') })))
      .toBe('feed-error')
  })

  it('reports a failed poll even when the last payload is still usable', () => {
    expect(screenStateFrom(input({ failure: 'timeout' }))).toBe('feed-error')
  })

  it.each(['timeout', 'network', 'http-error', 'invalid-json'] as const)(
    'reports %s as a feed error',
    (failure) => {
      expect(screenStateFrom(input({ failure }))).toBe('feed-error')
    },
  )
})

describe('stale-data state', () => {
  it('reports stale data', () => {
    expect(screenStateFrom(input({
      assessment: assessment('undetermined', 'stale-data', 'stale'),
    }))).toBe('stale-data')
  })

  it('reports an undetermined verdict as stale rather than as no warning', () => {
    // "We could not tell" must never render as "nothing here".
    expect(screenStateFrom(input({
      assessment: assessment('undetermined', 'point-only', 'fresh'),
    }))).toBe('stale-data')
  })
})

describe('no-warning state', () => {
  it('is reached only with a location, fresh data and a clean negative', () => {
    expect(screenStateFrom(input())).toBe('no-warning')
  })

  it('is never reached while anything is unknown', () => {
    const unknowns: Partial<ScreenInput>[] = [
      { hasLocation: false },
      { failure: 'network' },
      { assessment: assessment('undetermined', 'point-only') },
      { assessment: assessment('unavailable', 'no-warning-data') },
      { assessment: assessment('not-currently-affected', 'outside-polygon', 'stale') },
    ]
    for (const over of unknowns) {
      expect(screenStateFrom(input(over)), JSON.stringify(over)).not.toBe('no-warning')
    }
  })
})

describe('change reporting', () => {
  it('keeps level changes, arrivals and cancellations', () => {
    const changes: WarningChange[] = [
      escalation,
      { kind: 'new', id: 'b', level: 'advice' },
      { kind: 'cancelled', id: 'c', lastLevel: 'advice' },
      { kind: 'updated', id: 'd', fields: ['sizeHa'] },
      { kind: 'area-changed', id: 'e' },
    ]
    expect(significantChanges(changes).map((c) => c.kind))
      .toEqual(['level-changed', 'new', 'cancelled'])
  })

  it('identifies an escalation', () => {
    expect(isEscalation([escalation])).toBe(true)
    expect(isEscalation([{
      kind: 'level-changed', id: 'a', from: 'emergency-warning', to: 'advice', escalated: false,
    }])).toBe(false)
  })

  it('prefers an escalation over any other change when describing what happened', () => {
    const chosen = describeChange([{ kind: 'new', id: 'b', level: 'advice' }, escalation])
    expect(chosen).toEqual(escalation)
  })

  it('returns nothing when only insignificant changes arrived', () => {
    expect(describeChange([{ kind: 'area-changed', id: 'a' }])).toBeNull()
  })
})
