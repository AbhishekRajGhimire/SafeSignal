import type { ScenarioStep } from './scenario'
import { diffWarnings } from '@/lib/domain/lifecycle'
import type { Warning } from '@/lib/domain/warning'
import type { WarningFeed, WarningSource } from './types'

export interface DemoState {
  stepIndex: number
  playing: boolean
  totalSteps: number
}

export class DemoSource implements WarningSource {
  private stepIndex = 0
  private playing = false
  private timer: ReturnType<typeof setTimeout> | null = null
  private readonly feedListeners = new Set<(feed: WarningFeed) => void>()
  /** Previous step's warnings, so the demo emits real lifecycle changes. */
  private previous: Warning[] = []
  private emitted = false
  private readonly stateListeners = new Set<(state: DemoState) => void>()

  constructor(private readonly steps: ScenarioStep[]) {}

  get state(): DemoState {
    return { stepIndex: this.stepIndex, playing: this.playing, totalSteps: this.steps.length }
  }

  subscribe(onFeed: (feed: WarningFeed) => void): () => void {
    this.feedListeners.add(onFeed)
    onFeed(this.currentFeed())
    return () => {
      this.feedListeners.delete(onFeed)
    }
  }

  onStateChange(onState: (state: DemoState) => void): () => void {
    this.stateListeners.add(onState)
    return () => {
      this.stateListeners.delete(onState)
    }
  }

  play(): void {
    if (this.playing) return
    this.playing = true
    this.emitState()
    this.scheduleNext()
  }

  pause(): void {
    this.playing = false
    this.clearTimer()
    this.emitState()
  }

  restart(): void {
    this.pause()
    this.stepIndex = 0
    this.previous = []
    this.emitted = false
    this.emitFeed()
    this.emitState()
  }

  /** Lets a presenter jump straight to the emergency warning. */
  seek(index: number): void {
    this.clearTimer()
    this.stepIndex = Math.max(0, Math.min(index, this.steps.length - 1))
    this.emitFeed()
    this.emitState()
    if (this.playing) this.scheduleNext()
  }

  dispose(): void {
    this.clearTimer()
    this.feedListeners.clear()
    this.stateListeners.clear()
  }

  private scheduleNext(): void {
    this.clearTimer()
    const next = this.stepIndex + 1
    if (next >= this.steps.length) {
      this.playing = false
      this.emitState()
      return
    }

    const delay = this.steps[next].atMs - this.steps[this.stepIndex].atMs
    this.timer = setTimeout(() => {
      this.stepIndex = next
      this.emitFeed()
      this.emitState()
      this.scheduleNext()
    }, Math.max(0, delay))
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  /**
   * Demo mode runs the same diff engine as live mode, so the escalation
   * produces genuine level-changed events rather than a scripted animation.
   */
  private currentFeed(): WarningFeed {
    const step = this.steps[this.stepIndex]
    const warnings = step?.warnings ?? []
    const previous = this.emitted ? this.previous : []
    const changes = this.emitted ? diffWarnings(previous, warnings) : []
    this.previous = warnings
    this.emitted = true
    return {
      warnings,
      fetchedAt: new Date(),
      // A scenario may simulate the feed itself degrading, so the stale and
      // error screens can be rehearsed without unplugging anything.
      stale: step?.feedState?.stale ?? false,
      freshness: step?.feedState?.freshness ?? 'fresh',
      changes,
      previous,
      failure: step?.feedState?.failure ?? null,
      dropped: 0,
      duplicates: 0,
    }
  }

  private emitFeed(): void {
    const feed = this.currentFeed()
    for (const listener of this.feedListeners) listener(feed)
  }

  private emitState(): void {
    const state = this.state
    for (const listener of this.stateListeners) listener(state)
  }
}
