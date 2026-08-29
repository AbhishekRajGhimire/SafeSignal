'use client'

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { LiveSource } from '@/lib/sources/live'
import { DemoSource, type DemoState } from '@/lib/sources/demo'
import { buildScenarios, type DemoScenario, type DemoScenarioId } from '@/lib/sources/scenario'
import { EMPTY_FEED, type WarningFeed } from '@/lib/sources/types'
import { DEFAULT_DEMO_PLACE } from '@/lib/locations/nsw'
import type { UserProfile } from '@/lib/domain/profile'
import { enterScenario, leaveDemo } from '@/lib/sources/demoProfile'
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
}

const WarningContext = createContext<WarningContextValue | null>(null)

/** The strongest single demonstration, so ?demo=1 lands on it. */
const DEFAULT_SCENARIO: DemoScenarioId = 'escalation'

export function WarningProvider({ children }: { children: React.ReactNode }) {
  const { profile, update, ready } = useProfile()
  const [demoMode, setDemoMode] = useState(false)
  const [scenarioId, setScenarioId] = useState<DemoScenarioId>(DEFAULT_SCENARIO)
  const [feed, setFeed] = useState<WarningFeed>(EMPTY_FEED)
  const [demoState, setDemoState] = useState<DemoState | null>(null)
  /** The person's real profile, stashed while a scenario preset is applied. */
  const stashedProfile = useRef<UserProfile | null>(null)

  // A judge opening the shared link must reach the scenario without being
  // walked through a settings screen.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('demo') === '1') {
      setDemoMode(true)
    }
  }, [])

  const anchorLat = profile.location?.lat ?? DEFAULT_DEMO_PLACE.lat
  const anchorLon = profile.location?.lon ?? DEFAULT_DEMO_PLACE.lon
  const anchorLabel = profile.location?.label || DEFAULT_DEMO_PLACE.label

  const scenarios = useMemo(
    () => buildScenarios({ lat: anchorLat, lon: anchorLon }, anchorLabel),
    [anchorLat, anchorLon, anchorLabel],
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

  const applyTransition = (transition: ReturnType<typeof leaveDemo>) => {
    if (transition.patch) update(transition.patch)
    stashedProfile.current = transition.stash
  }

  const selectScenario = (id: DemoScenarioId) => {
    const next = scenarios.find((s) => s.id === id)
    if (!next) return
    applyTransition(enterScenario(profile, stashedProfile.current, next))
    setScenarioId(id)
  }

  const resetDemo = () => {
    applyTransition(leaveDemo(stashedProfile.current))
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
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [feed, demo, demoState, demoMode, scenarios, scenarioId],
  )

  return <WarningContext.Provider value={value}>{children}</WarningContext.Provider>
}

export function useWarnings(): WarningContextValue {
  const context = useContext(WarningContext)
  if (!context) throw new Error('useWarnings must be used inside WarningProvider')
  return context
}
