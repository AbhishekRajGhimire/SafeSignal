import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildScenario } from './scenario'
import { DemoSource, type DemoState } from './demo'
import type { WarningFeed } from './types'

const KATOOMBA = { lat: -33.7128, lon: 150.3119 }

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('buildScenario', () => {
  it('escalates from advice to emergency warning, then updates without escalating', () => {
    const steps = buildScenario(KATOOMBA, 'Katoomba')
    expect(steps.map((s) => s.warnings[0].level)).toEqual([
      'advice',
      'watch-and-act',
      'emergency-warning',
      // The level holds while the fire grows, so the demo can show an
      // update that is not an escalation.
      'emergency-warning',
    ])
    expect(steps[3].warnings[0].sizeHa).toBeGreaterThan(steps[2].warnings[0].sizeHa!)
  })

  it('moves the fire closer at each step', () => {
    const steps = buildScenario(KATOOMBA, 'Katoomba')
    const gap = (i: number) => Math.abs(steps[i].warnings[0].point!.lat - KATOOMBA.lat)
    expect(gap(1)).toBeLessThan(gap(0))
    expect(gap(2)).toBeLessThan(gap(1))
  })

  it('has strictly increasing timestamps starting at zero', () => {
    const steps = buildScenario(KATOOMBA, 'Katoomba')
    expect(steps[0].atMs).toBe(0)
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i].atMs).toBeGreaterThan(steps[i - 1].atMs)
    }
  })

  it('names the anchor location in the warning text', () => {
    const steps = buildScenario(KATOOMBA, 'Katoomba')
    expect(steps[0].warnings[0].location).toContain('Katoomba')
  })
})

describe('DemoSource', () => {
  it('emits the first step immediately on subscribe', () => {
    const source = new DemoSource(buildScenario(KATOOMBA, 'Katoomba'))
    const received: WarningFeed[] = []
    source.subscribe((feed) => received.push(feed))

    expect(received).toHaveLength(1)
    expect(received[0].warnings[0].level).toBe('advice')
    source.dispose()
  })

  it('advances through the scenario once played', () => {
    const steps = buildScenario(KATOOMBA, 'Katoomba')
    const source = new DemoSource(steps)
    const received: WarningFeed[] = []
    source.subscribe((feed) => received.push(feed))

    source.play()
    vi.advanceTimersByTime(steps[steps.length - 1].atMs + 1000)

    expect(received[received.length - 1].warnings[0].level).toBe('emergency-warning')
    source.dispose()
  })

  it('stops advancing when paused', () => {
    const steps = buildScenario(KATOOMBA, 'Katoomba')
    const source = new DemoSource(steps)
    const received: WarningFeed[] = []
    source.subscribe((feed) => received.push(feed))

    source.play()
    source.pause()
    vi.advanceTimersByTime(600_000)

    expect(received).toHaveLength(1)
    source.dispose()
  })

  it('jumps straight to a step when seeked', () => {
    const source = new DemoSource(buildScenario(KATOOMBA, 'Katoomba'))
    const received: WarningFeed[] = []
    source.subscribe((feed) => received.push(feed))

    source.seek(2)

    expect(received[received.length - 1].warnings[0].level).toBe('emergency-warning')
    source.dispose()
  })

  it('clamps a seek beyond the end instead of throwing', () => {
    const source = new DemoSource(buildScenario(KATOOMBA, 'Katoomba'))
    source.subscribe(() => {})
    const steps = buildScenario(KATOOMBA, 'Katoomba')
    expect(() => source.seek(99)).not.toThrow()
    expect(source.state.stepIndex).toBe(steps.length - 1)
    source.dispose()
  })

  it('returns to the first step on restart', () => {
    const source = new DemoSource(buildScenario(KATOOMBA, 'Katoomba'))
    const received: WarningFeed[] = []
    source.subscribe((feed) => received.push(feed))

    source.seek(2)
    source.restart()

    expect(received[received.length - 1].warnings[0].level).toBe('advice')
    expect(source.state.playing).toBe(false)
    source.dispose()
  })

  it('reports state changes to listeners', () => {
    const source = new DemoSource(buildScenario(KATOOMBA, 'Katoomba'))
    const states: DemoState[] = []
    source.onStateChange((s) => states.push(s))

    source.play()
    source.pause()

    expect(states.some((s) => s.playing)).toBe(true)
    expect(states[states.length - 1].playing).toBe(false)
    expect(states[states.length - 1].totalSteps).toBe(buildScenario(KATOOMBA, 'Katoomba').length)
    source.dispose()
  })

  it('never marks the demo feed stale', () => {
    const source = new DemoSource(buildScenario(KATOOMBA, 'Katoomba'))
    const received: WarningFeed[] = []
    source.subscribe((feed) => received.push(feed))
    expect(received[0].stale).toBe(false)
    source.dispose()
  })
})
