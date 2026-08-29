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
}

const ProfileContext = createContext<ProfileContextValue | null>(null)

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<UserProfile>(DEFAULT_PROFILE)
  const [ready, setReady] = useState(false)

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
    if (!ready) return
    saveProfile(profile)
  }, [profile, ready])

  const update = useCallback((patch: Partial<UserProfile>) => {
    setProfile((current) => ({ ...current, ...patch }))
  }, [])

  const value = useMemo(() => ({ profile, update, ready }), [profile, update, ready])

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
