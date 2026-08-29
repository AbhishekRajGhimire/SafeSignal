'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { DEFAULT_PROFILE, loadProfile, saveProfile, type UserProfile } from '@/lib/domain/profile'
import { getPack, SPEECH_LOCALE, type PhrasePack } from '@/lib/i18n'

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
    root.lang = SPEECH_LOCALE[profile.language]
    root.dataset.textSize = profile.largeText ? 'large' : 'normal'
  }, [profile.language, profile.largeText, ready])

  const update = useCallback((patch: Partial<UserProfile>) => {
    setProfile((current) => {
      const next = { ...current, ...patch }
      saveProfile(next)
      return next
    })
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
