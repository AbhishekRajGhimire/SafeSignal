'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { LiveSource } from '@/lib/sources/live'
import { DemoSource, type DemoState } from '@/lib/sources/demo'
import { buildScenario } from '@/lib/sources/scenario'
import type { WarningFeed } from '@/lib/sources/types'
import { DEFAULT_DEMO_PLACE } from '@/lib/locations/nsw'
import { useProfile } from './ProfileProvider'

const EMPTY: WarningFeed = { warnings: [], fetchedAt: null, stale: false }

interface WarningContextValue {
  feed: WarningFeed
  demo: DemoSource | null
  demoState: DemoState | null
  demoMode: boolean
  setDemoMode: (on: boolean) => void
}

const WarningContext = createContext<WarningContextValue | null>(null)

export function WarningProvider({ children }: { children: React.ReactNode }) {
  const { profile, ready } = useProfile()
  const [demoMode, setDemoMode] = useState(false)
  const [feed, setFeed] = useState<WarningFeed>(EMPTY)
  const [demoState, setDemoState] = useState<DemoState | null>(null)

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

  const demo = useMemo(
    () =>
      demoMode
        ? new DemoSource(buildScenario({ lat: anchorLat, lon: anchorLon }, anchorLabel))
        : null,
    [demoMode, anchorLat, anchorLon, anchorLabel],
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

  const value = useMemo(
    () => ({ feed, demo, demoState, demoMode, setDemoMode }),
    [feed, demo, demoState, demoMode],
  )

  return <WarningContext.Provider value={value}>{children}</WarningContext.Provider>
}

export function useWarnings(): WarningContextValue {
  const context = useContext(WarningContext)
  if (!context) throw new Error('useWarnings must be used inside WarningProvider')
  return context
}
