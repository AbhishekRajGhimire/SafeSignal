import { describe, it, expect } from 'vitest'
import { buildScenarios, type DemoScenarioId } from './scenario'
import { DemoSource } from './demo'
import { enterScenario, leaveDemo } from './demoProfile'
import { assessLocation } from '@/lib/domain/relevance'
import { screenStateFrom } from '@/lib/domain/screenState'
import { summariseWarningChange } from '@/lib/domain/changeSummary'
import { DEFAULT_PROFILE, type UserProfile } from '@/lib/domain/profile'
import type { WarningFeed } from './types'

const KATOOMBA = { lat: -33.7128, lon: 150.3119 }
const SCENARIOS = buildScenarios(KATOOMBA, 'Katoomba')
const byId = (id: DemoScenarioId) => SCENARIOS.find((s) => s.id === id)!

/** Collects every feed a scenario emits as a presenter steps through it. */
function walk(id: DemoScenarioId): WarningFeed[] {
  const source = new DemoSource(byId(id).steps)
  const seen: WarningFeed[] = []
  const stop = source.subscribe((feed) => seen.push(feed))
  for (let i = 1; i < byId(id).steps.length; i += 1) source.seek(i)
  stop()
  source.dispose()
  return seen
}

const assess = (feed: WarningFeed) =>
  assessLocation(feed.warnings, KATOOMBA, feed.freshness)

const state = (feed: WarningFeed) =>
  screenStateFrom({
    ready: true,
    hasLocation: true,
    assessment: assess(feed),
    changes: feed.changes,
    failure: feed.failure,
  })

describe('the demo scenario set', () => {
  it('offers all six rehearsable scenarios', () => {
    expect(SCENARIOS.map((s) => s.id)).toEqual([
      'no-warning',
      'emergency-here',
      'escalation',
      'not-affected',
      'feed-loss',
      'accessibility-profile',
    ])
  })

  it('gives every scenario at least one step and a presenter-facing name', () => {
    for (const scenario of SCENARIOS) {
      expect(scenario.steps.length, scenario.id).toBeGreaterThan(0)
      expect(scenario.name.length, scenario.id).toBeGreaterThan(0)
    }
  })
})

describe('demo data is always labelled simulated', () => {
  it('marks every warning in every scenario as simulated in its provenance', () => {
    for (const scenario of SCENARIOS) {
      for (const step of scenario.steps) {
        for (const warning of step.warnings) {
          expect(warning.provenance.sourceName, scenario.id).toContain('SIMULATED')
          expect(warning.provenance.copyright, scenario.id).toContain('demonstration only')
        }
      }
    }
  })

  it('gives every demo warning an id that identifies it as demo data', () => {
    for (const scenario of SCENARIOS) {
      for (const step of scenario.steps) {
        for (const warning of step.warnings) {
          expect(warning.id, scenario.id).toMatch(/^safesignal-demo/)
        }
      }
    }
  })

  it('marks the raw record as simulated too, so nothing downstream is fooled', () => {
    const warning = byId('emergency-here').steps[0].warnings[0]
    expect(warning.raw.properties).toEqual({ simulated: true })
  })
})

describe('scenario 1 — no active warning', () => {
  it('emits no warnings and reads as a clean negative', () => {
    const [feed] = walk('no-warning')
    expect(feed.warnings).toEqual([])
    expect(assess(feed).verdict).toBe('not-currently-affected')
    expect(state(feed)).toBe('no-warning')
  })
})

describe('scenario 2 — emergency warning at the location', () => {
  it('places the user inside an Emergency Warning polygon', () => {
    const [feed] = walk('emergency-here')
    const assessment = assess(feed)
    expect(assessment.verdict).toBe('affected')
    expect(assessment.affected).toHaveLength(1)
    expect(assessment.affected[0].warning.level).toBe('emergency-warning')
    expect(assessment.affected[0].reason).toBe('inside-polygon')
    expect(state(feed)).toBe('warning')
  })

  it('carries official advice text, so the language layer has something to work on', () => {
    const warning = byId('emergency-here').steps[0].warnings[0]
    expect(warning.rawAdvice).toBeTruthy()
  })
})

describe('scenario 3 — the warning changes', () => {
  it('escalates through Advice, Watch and Act, and Emergency Warning', () => {
    const feeds = walk('escalation')
    const levels = feeds.map((f) => f.warnings[0]?.level)
    expect(levels.slice(0, 3)).toEqual(['advice', 'watch-and-act', 'emergency-warning'])
  })

  it('produces real level-change events, not a scripted animation', () => {
    const feeds = walk('escalation')
    expect(feeds[1].changes).toContainEqual({
      kind: 'level-changed',
      id: 'safesignal-demo-incident',
      from: 'advice',
      to: 'watch-and-act',
      escalated: true,
    })
    // The fire also grows and its status changes, so the diff reports those
    // alongside the escalation rather than only the level.
    expect(feeds[1].changes.map((c) => c.kind).sort())
      .toEqual(['area-changed', 'level-changed', 'updated'])
  })

  it('reaches the warning-updated state with a describable change', () => {
    const feeds = walk('escalation')
    const escalated = feeds[2]
    expect(state(escalated)).toBe('warning-updated')
    const details = summariseWarningChange(escalated.previous[0], escalated.warnings[0])
    // Status is already "Out of control" at Watch and Act, so it does not
    // change again here. Level, size and area do.
    expect(details.map((d) => d.kind).sort()).toEqual(['area', 'level', 'size'])
  })

  it('has a final step that updates without changing the level', () => {
    // Proves the diff engine tells an update apart from an escalation.
    const feeds = walk('escalation')
    const last = feeds[feeds.length - 1]
    expect(last.warnings[0].level).toBe('emergency-warning')
    expect(last.changes.some((c) => c.kind === 'level-changed')).toBe(false)
  })

  it('puts the user inside the fire area by the emergency step', () => {
    const feeds = walk('escalation')
    expect(assess(feeds[2]).affected[0].inside).toBe(true)
  })
})

describe('scenario 4 — warning does not affect the location', () => {
  it('surfaces the warning but reports the location as not covered', () => {
    const [feed] = walk('not-affected')
    const assessment = assess(feed)
    expect(feed.warnings).toHaveLength(1)
    expect(assessment.verdict).toBe('not-currently-affected')
    expect(assessment.affected).toHaveLength(0)
    expect(assessment.nearby).toHaveLength(1)
    expect(state(feed)).toBe('no-warning')
  })

  it('uses a valid polygon that excludes the location, not a missing one', () => {
    // A missing polygon would read as "cannot determine", which is a
    // different scenario entirely.
    const [feed] = walk('not-affected')
    expect(feed.warnings[0].polygons.length).toBeGreaterThan(0)
    expect(assess(feed).nearby[0].reason).toBe('outside-polygon')
  })
})

describe('scenario 5 — the feed degrades', () => {
  it('starts fresh, goes stale, then becomes unreachable', () => {
    const feeds = walk('feed-loss')
    expect(feeds).toHaveLength(3)
    expect([feeds[0].freshness, feeds[0].failure]).toEqual(['fresh', null])
    expect([feeds[1].freshness, feeds[1].failure]).toEqual(['stale', null])
    expect([feeds[2].freshness, feeds[2].failure]).toEqual(['stale', 'network'])
  })

  it('walks the interface through no-warning, stale-data and feed-error', () => {
    const feeds = walk('feed-loss')
    expect(feeds.map(state)).toEqual(['no-warning', 'stale-data', 'feed-error'])
  })
})

describe('scenario 6 — accessibility profile', () => {
  const scenario = byId('accessibility-profile')

  it('presets Mandarin, large text, audio and mobility assistance', () => {
    expect(scenario.profilePreset).toEqual({
      language: 'zh',
      textSize: 'large',
      audio: true,
      needs: ['mobility'],
      transport: 'needs-assistance',
    })
  })

  it('shows an emergency at the location, so every feature is on screen at once', () => {
    const [feed] = walk('accessibility-profile')
    expect(assess(feed).verdict).toBe('affected')
  })
})

describe('the presenter profile is borrowed, never taken', () => {
  const mine: UserProfile = {
    ...DEFAULT_PROFILE,
    language: 'en',
    textSize: 'standard',
    location: { lat: -33.7, lon: 150.3, label: 'Katoomba' },
    completedSetup: true,
  }

  it('stashes the real profile when a preset scenario is chosen', () => {
    const transition = enterScenario(mine, null, byId('accessibility-profile'))
    expect(transition.patch).toEqual(byId('accessibility-profile').profilePreset)
    expect(transition.stash).toEqual(mine)
  })

  it('does not overwrite the stash when moving between preset scenarios', () => {
    const first = enterScenario(mine, null, byId('accessibility-profile'))
    const preset = { ...mine, ...byId('accessibility-profile').profilePreset } as UserProfile
    const second = enterScenario(preset, first.stash, byId('accessibility-profile'))
    // The stash still holds the presenter's own settings, not the preset.
    expect(second.stash).toEqual(mine)
  })

  it('restores the real profile on a scenario with no preset', () => {
    const entered = enterScenario(mine, null, byId('accessibility-profile'))
    const restored = enterScenario(mine, entered.stash, byId('no-warning'))
    expect(restored.patch).toEqual(mine)
    expect(restored.stash).toBeNull()
  })

  it('restores the real profile on reset and on leaving demo mode', () => {
    const entered = enterScenario(mine, null, byId('accessibility-profile'))
    expect(leaveDemo(entered.stash)).toEqual({ patch: mine, stash: null })
  })

  it('leaves the profile alone when nothing was ever stashed', () => {
    expect(leaveDemo(null)).toEqual({ patch: null, stash: null })
  })
})

describe('reset returns the demo to a known state', () => {
  it('restarts a scenario at its first step, paused', () => {
    const source = new DemoSource(byId('escalation').steps)
    const seen: WarningFeed[] = []
    source.subscribe((feed) => seen.push(feed))
    source.play()
    source.seek(2)
    expect(source.state.stepIndex).toBe(2)

    source.restart()
    expect(source.state.stepIndex).toBe(0)
    expect(source.state.playing).toBe(false)
    // The diff baseline resets too, so replaying is not read as a downgrade.
    expect(seen[seen.length - 1].changes).toEqual([])
    source.dispose()
  })
})
