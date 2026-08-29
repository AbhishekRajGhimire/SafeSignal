'use client'

import { useEffect, useState } from 'react'
import { checkCapability, speak, stopSpeaking } from '@/lib/speech/tts'
import { usePack } from './ProfileProvider'

export function SpeakButton({ text, locale }: { text: string; locale: string }) {
  const pack = usePack()
  const [hasVoice, setHasVoice] = useState<boolean | null>(null)
  const [speaking, setSpeaking] = useState(false)

  useEffect(() => {
    let active = true
    void checkCapability(locale).then((capability) => {
      if (active) setHasVoice(capability.supported && capability.hasVoice)
    })
    return () => {
      active = false
      stopSpeaking()
    }
  }, [locale])

  // Say so plainly rather than presenting a button that does nothing.
  if (hasVoice === false) return <p className="muted">{pack.ui.audioUnavailable}</p>

  return (
    <button
      type="button"
      className="button button--secondary"
      onClick={() => {
        if (speaking) {
          stopSpeaking()
          setSpeaking(false)
          return
        }
        setSpeaking(true)
        void speak(text, locale)
      }}
    >
      {speaking ? pack.ui.stopListening : pack.ui.listen}
    </button>
  )
}
