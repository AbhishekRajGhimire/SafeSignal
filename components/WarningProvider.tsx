'use client'

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { LiveSource } from '@/lib/sources/live'
import { DemoSource, type DemoState } from '@/lib/sources/demo'
import { buildScenarios, type DemoScenario, type DemoScenarioId } from '@/lib/sources/scenario'
import { EMPTY_FEED, type WarningFeed } from '@/lib/sources/types'
import { DEFAULT_DEMO_PLACE } from '@/lib/locations/nsw'
import type { UserProfile } from '@/lib/domain/profile'
import {
  enterDemo,
  enterScenario,
  leaveDemo,
  restoreDemo,
  type ProfileTransition,
} from '@/lib/sources/demoProfile'
import { useProfile } from './ProfileProvider'

interface WarningContextValue {
  feed: WarningFeed
  demo: DemoSource | null
  demoState: DemoState | null
  demoMode: boolean
  setDemoMode: (on: boolean) => void
  scenarios: DemoScenario[]
  scenarioId: DemoScenarioId
  selectScenario: (id: DemoScenarioId) => void
  /** Back to the default scenario, step 0, paused, real profile restored. */
  resetDemo: () => void
  /**
   * The location the app should reason about.
   *
   * Normally the person's own. In demo mode with no profile location it is
   * the same Blue Mountains anchor the scenarios are built around, because a
   * judge opening ?demo=1 on a cold device has no location and must still
   * see the emergency rather than "we do not know where you are".
   */
  assessLocation: UserProfile['location']
}

const WarningContext = createContext<WarningContextValue | null>(null)

/** The strongest single demonstration, so ?demo=1 lands on it. */
const DEFAULT_SCENARIO: DemoScenarioId = 'escalation'

export function WarningProvider({ children }: { children: React.ReactNode }) {
  const { profile, update, ready, setPersist } = useProfile()
  const [demoMode, setDemoMode] = useState(false)
  const [scenarioId, setScenarioId] = useState<DemoScenarioId>(DEFAULT_SCENARIO)
  const [feed, setFeed] = useState<WarningFeed>(EMPTY_FEED)
  const [demoState, setDemoState] = useState<DemoState | null>(null)
  /** The person's real profile, stashed for as long as demo mode runs. */
  const stashedProfile = useRef<UserProfile | null>(null)

  // A judge opening the shared link must reach the scenario without being
  // walked through a settings screen.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('demo') === '1') {
      setDemoMode(true)
    }
  }, [])

  // Demo mode borrows the whole profile, not just the fields a scenario
  // preset touches, and stops it reaching storage until it is given back.
  //
  // Waits for `ready`: before the stored profile has loaded, `profile` is
  // still DEFAULT_PROFILE, and stashing that would overwrite the person's
  // real settings with defaults when the demo ended.
  useEffect(() => {
    if (!ready) return
    if (!demoMode) {
      setPersist(true)
      return
    }
    if (!stashedProfile.current) {
      stashedProfile.current = enterDemo(profile).stash
    }
    setPersist(false)
    // `profile` is read, deliberately not depended on: the stash is a
    // snapshot of the moment demo mode began, and must not follow later edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoMode, ready, setPersist])

  const anchorLat = profile.location?.lat ?? DEFAULT_DEMO_PLACE.lat
  const anchorLon = profile.location?.lon ?? DEFAULT_DEMO_PLACE.lon
  const anchorLabel = profile.location?.label || DEFAULT_DEMO_PLACE.label

  const scenarios = useMemo(
    () => buildScenarios({ lat: anchorLat, lon: anchorLon }, anchorLabel),
    [anchorLat, anchorLon, anchorLabel],
  )

  const assessLocation = useMemo(
    () =>
      profile.location ??
      (demoMode ? { lat: anchorLat, lon: anchorLon, label: anchorLabel } : null),
    [profile.location, demoMode, anchorLat, anchorLon, anchorLabel],
  )

  const scenario = scenarios.find((s) => s.id === scenarioId) ?? scenarios[0]

  const demo = useMemo(
    () => (demoMode ? new DemoSource(scenario.steps) : null),
    [demoMode, scenario],
  )

  useEffect(() => {
    if (!ready) return

    if (demo) {
      const unsubscribeFeed = demo.subscribe(setFeed)
      const unsubscribeState = demo.onStateChange(setDemoState)
      setDemoState(demo.state)
      return () => {
        unsubscribeFeed()
        unsubscribeState()
        demo.dispose()
      }
    }

    setDemoState(null)
    const live = new LiveSource()
    return live.subscribe(setFeed)
  }, [demo, ready])

  const applyTransition = (transition: ProfileTransition) => {
    if (transition.patch) update(transition.patch)
    stashedProfile.current = transition.stash
  }

  const selectScenario = (id: DemoScenarioId) => {
    const next = scenarios.find((s) => s.id === id)
    if (!next) return
    applyTransition(enterScenario(stashedProfile.current, next))
    setScenarioId(id)
  }

  const resetDemo = () => {
    // Undoes a preset and a hand-made language or text size change alike, and
    // keeps the stash, because the presenter is still in demo mode.
    applyTransition(restoreDemo(stashedProfile.current))
    setScenarioId(DEFAULT_SCENARIO)
    demo?.restart()
  }

  const exitDemo = (on: boolean) => {
    if (!on) {
      applyTransition(leaveDemo(stashedProfile.current))
      setScenarioId(DEFAULT_SCENARIO)
    }
    setDemoMode(on)
  }

  const value = useMemo(
    () => ({
      feed,
      demo,
      demoState,
      demoMode,
      setDemoMode: exitDemo,
      scenarios,
      scenarioId,
      selectScenario,
      resetDemo,
      assessLocation,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [feed, demo, demoState, demoMode, scenarios, scenarioId, assessLocation],
  )

  return <WarningContext.Provider value={value}>{children}</WarningContext.Provider>
}

export function useWarnings(): WarningContextValue {
  const context = useContext(WarningContext)
  if (!context) throw new Error('useWarnings must be used inside WarningProvider')
  return context
}
