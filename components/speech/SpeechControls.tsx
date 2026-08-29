'use client'

import { useEffect, useState } from 'react'
import { usePack } from '../ProfileProvider'
import { checkSupport, getSpeechEngine, type SpeechSupport } from '@/lib/speech/tts'
import type { SpeechStatus } from '@/lib/speech/engine'

/**
 * Play, pause, resume, replay and stop for the accessible warning text.
 *
 * Audio is always additive. The text it reads is on screen the whole time,
 * and nothing here ever hides it: these controls sit beside the words, not
 * in place of them.
 *
 * The controls are ordinary buttons, so keyboard and screen-reader access
 * come from the platform rather than from anything reimplemented here.
 */
export function SpeechControls({ text, locale }: { text: string; locale: string }) {
  const pack = usePack()
  const [support, setSupport] = useState<SpeechSupport | null>(null)
  const [status, setStatus] = useState<SpeechStatus>({ state: 'idle', position: 0, total: 0 })

  useEffect(() => {
    let active = true
    void checkSupport(locale).then((result) => {
      if (active) setSupport(result)
    })
    return () => {
      active = false
    }
  }, [locale])

  useEffect(() => {
    const engine = getSpeechEngine()
    if (!engine) return
    const unsubscribe = engine.subscribe(setStatus)
    return () => {
      unsubscribe()
      // Leaving the screen must not leave a voice talking to an empty room.
      engine.stop()
    }
  }, [])

  // Say so plainly rather than presenting a button that does nothing.
  if (support === 'unsupported') {
    return <p className="speech__notice">{pack.ui.speechNotSupported}</p>
  }
  if (support === 'no-voice') {
    return <p className="speech__notice">{pack.ui.audioUnavailable}</p>
  }

  const engine = getSpeechEngine()
  const speaking = status.state === 'speaking'
  const paused = status.state === 'paused'
  const active = speaking || paused

  return (
    <div className="speech">
      <div className="speech__controls">
        {!active ? (
          <button
            type="button"
            className="button button--secondary speech__primary"
            onClick={() => engine?.speak(text, locale)}
          >
            <span className="speech__icon" aria-hidden="true">▶</span>
            {pack.ui.listen}
          </button>
        ) : (
          <>
            <button
              type="button"
              className="button button--secondary speech__primary"
              onClick={() => (speaking ? engine?.pause() : engine?.resume())}
            >
              <span className="speech__icon" aria-hidden="true">{speaking ? '⏸' : '▶'}</span>
              {speaking ? pack.ui.pause : pack.ui.resume}
            </button>
            <button
              type="button"
              className="button button--secondary"
              onClick={() => engine?.stop()}
            >
              <span className="speech__icon" aria-hidden="true">■</span>
              {pack.ui.stopListening}
            </button>
          </>
        )}

        {/* Replay stays available once there is something to replay, so a
            sentence that was missed can be heard again without hunting. */}
        {(active || status.total > 0) && (
          <button
            type="button"
            className="button button--secondary"
            onClick={() => engine?.replay()}
          >
            <span className="speech__icon" aria-hidden="true">↻</span>
            {pack.ui.replay}
          </button>
        )}
      </div>

      {/*
        The playing indicator. Carries a word, a shape and a position, so it
        does not depend on colour or on movement. Hidden from assistive
        technology on purpose: a screen reader user is already hearing their
        own voice output, and announcing "reading aloud" over it would
        collide rather than help.
      */}
      {active && (
        <p className="speech__status" aria-hidden="true">
          <span className={`speech__bars${speaking ? ' speech__bars--on' : ''}`}>
            <span /><span /><span />
          </span>
          {speaking ? pack.ui.readingAloud : pack.ui.paused}
          {status.total > 1 && (
            <span className="speech__position">
              {status.position} / {status.total}
            </span>
          )}
        </p>
      )}
    </div>
  )
}
