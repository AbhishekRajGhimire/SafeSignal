'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_PROFILE,
  directionOf,
  loadProfile,
  saveProfile,
  type UserProfile,
} from '@/lib/domain/profile'
import { getPack, speechLocaleOf, type PhrasePack } from '@/lib/i18n'

interface ProfileContextValue {
  profile: UserProfile
  update: (patch: Partial<UserProfile>) => void
  ready: boolean
  /**
   * Turns storage writes off while demo mode borrows the profile.
   *
   * A demo changes real settings: scenario 6 applies an accessibility preset,
   * and a presenter may switch language or text size to show a judge. None of
   * that belongs on the device. Restoring the stash on exit is not enough on
   * its own, because a browser closed mid-demo never reaches the exit.
   */
  setPersist: (on: boolean) => void
}

const ProfileContext = createContext<ProfileContextValue | null>(null)

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<UserProfile>(DEFAULT_PROFILE)
  const [ready, setReady] = useState(false)
  const [persist, setPersist] = useState(true)

  // localStorage is only available after hydration, so the first render uses
  // defaults and this fills in the real profile.
  useEffect(() => {
    setProfile(loadProfile())
    setReady(true)
  }, [])

  useEffect(() => {
    if (!ready) return
    const root = document.documentElement
    root.lang = speechLocaleOf(profile.language)
    // Arabic is right-to-left. Everything else in the set is left-to-right.
    root.dir = directionOf(profile.language)
    root.dataset.textSize = profile.textSize
  }, [profile.language, profile.textSize, ready])

  // Persisting in an effect rather than inside the state updater: StrictMode
  // double-invokes updaters, and a side effect does not belong in one. The
  // `ready` guard stops the first render writing defaults over a real
  // stored profile before the load above has run.
  useEffect(() => {
    if (!ready || !persist) return
    saveProfile(profile)
  }, [profile, ready, persist])

  const update = useCallback((patch: Partial<UserProfile>) => {
    setProfile((current) => ({ ...current, ...patch }))
  }, [])

  const value = useMemo(
    () => ({ profile, update, ready, setPersist }),
    [profile, update, ready],
  )

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
}

export function useProfile(): ProfileContextValue {
  const context = useContext(ProfileContext)
  if (!context) throw new Error('useProfile must be used inside ProfileProvider')
  return context
}

export function usePack(): PhrasePack {
  return getPack(useProfile().profile.language)
}
