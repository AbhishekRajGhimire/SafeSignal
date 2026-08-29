import { describe, it, expect, vi } from 'vitest'
import {
  RATE,
  SpeechEngine,
  pickVoice,
  splitForSpeech,
  type SpeechStatus,
  type SynthLike,
  type UtteranceLike,
  type VoiceLike,
} from './engine'

/** A synthesiser that records calls and lets a test end each utterance. */
function fakeSynth(voices: VoiceLike[] = [{ lang: 'en-AU', name: 'Karen' }]) {
  const spoken: UtteranceLike[] = []
  const calls = { cancel: 0, pause: 0, resume: 0 }
  const synth: SynthLike = {
    speak: (u) => void spoken.push(u),
    cancel: () => void (calls.cancel += 1),
    pause: () => void (calls.pause += 1),
    resume: () => void (calls.resume += 1),
    getVoices: () => voices,
  }
  const make = (text: string): UtteranceLike => ({
    text, lang: '', rate: 1, voice: null, onend: null, onerror: null,
  })
  const engine = new SpeechEngine(synth, make)
  const finishLast = () => spoken[spoken.length - 1].onend?.()
  const failLast = () => spoken[spoken.length - 1].onerror?.(new Error('x'))
  return { engine, spoken, calls, finishLast, failLast }
}

function track(engine: SpeechEngine) {
  const seen: SpeechStatus[] = []
  engine.subscribe((s) => seen.push({ ...s }))
  return seen
}

describe('splitForSpeech', () => {
  it('splits on sentence endings and keeps the punctuation', () => {
    expect(splitForSpeech('You are in danger. Leave now! Is it clear?'))
      .toEqual(['You are in danger.', 'Leave now!', 'Is it clear?'])
  })

  it('handles Chinese, Devanagari and Arabic sentence endings', () => {
    expect(splitForSpeech('你有危险。立即离开。')).toEqual(['你有危险。', '立即离开。'])
    expect(splitForSpeech('आप खतरे में हैं। अभी निकलें।')).toEqual(['आप खतरे में हैं।', 'अभी निकलें।'])
    expect(splitForSpeech('أنت في خطر؟ غادر الآن.')).toEqual(['أنت في خطر؟', 'غادر الآن.'])
  })

  it('returns a single chunk for text with no terminator', () => {
    expect(splitForSpeech('Leave now')).toEqual(['Leave now'])
  })

  it('returns nothing for empty or whitespace text', () => {
    expect(splitForSpeech('')).toEqual([])
    expect(splitForSpeech('   \n ')).toEqual([])
  })

  it('breaks an over-long sentence at a space, never mid-word', () => {
    const long = 'word '.repeat(120).trim()
    const chunks = splitForSpeech(long)
    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(200)
      expect(chunk.startsWith(' ')).toBe(false)
      expect(chunk).not.toMatch(/wor$|or$/)
    }
    expect(chunks.join(' ')).toBe(long)
  })
})

describe('pickVoice', () => {
  const voices: VoiceLike[] = [
    { lang: 'en-US', name: 'Alex' },
    { lang: 'zh-CN', name: 'Ting' },
    { lang: 'zh-TW', name: 'Mei' },
  ]

  it('prefers an exact locale match', () => {
    expect(pickVoice(voices, 'zh-CN')?.name).toBe('Ting')
  })

  it('falls back to the same base language', () => {
    expect(pickVoice(voices, 'zh-HK')?.name).toBe('Ting')
  })

  it('returns null when the language is absent, rather than a wrong voice', () => {
    expect(pickVoice(voices, 'hi-IN')).toBeNull()
  })
})

describe('reading aloud', () => {
  it('speaks the first sentence and reports its position', () => {
    const { engine, spoken } = fakeSynth()
    engine.speak('One. Two. Three.', 'en-AU')
    expect(spoken).toHaveLength(1)
    expect(spoken[0].text).toBe('One.')
    expect(engine.getStatus()).toEqual({ state: 'speaking', position: 1, total: 3 })
  })

  it('applies the locale, the slower rate and a matching voice', () => {
    const { engine, spoken } = fakeSynth([{ lang: 'hi-IN', name: 'Lekha' }])
    engine.speak('नमस्ते।', 'hi-IN')
    expect(spoken[0].lang).toBe('hi-IN')
    expect(spoken[0].rate).toBe(RATE)
    expect(spoken[0].voice?.name).toBe('Lekha')
  })

  it('advances through every sentence and then returns to idle', () => {
    const { engine, spoken, finishLast } = fakeSynth()
    engine.speak('One. Two. Three.', 'en-AU')
    finishLast()
    expect(engine.getStatus().position).toBe(2)
    finishLast()
    expect(engine.getStatus().position).toBe(3)
    finishLast()
    // The bug this replaces: the old button stayed on "Stop" forever
    // because nothing observed the end of speech.
    expect(engine.getStatus().state).toBe('idle')
    expect(spoken.map((u) => u.text)).toEqual(['One.', 'Two.', 'Three.'])
  })

  it('continues past a failed sentence rather than stranding the rest', () => {
    const { engine, spoken, failLast } = fakeSynth()
    engine.speak('One. Two.', 'en-AU')
    failLast()
    expect(spoken.map((u) => u.text)).toEqual(['One.', 'Two.'])
  })

  it('cancels anything queued before starting, so taps do not stack', () => {
    const { engine, calls } = fakeSynth()
    engine.speak('One.', 'en-AU')
    engine.speak('Two.', 'en-AU')
    expect(calls.cancel).toBe(2)
  })

  it('ignores a late callback from a run that was cancelled', () => {
    const { engine, spoken, finishLast } = fakeSynth()
    engine.speak('One. Two. Three.', 'en-AU')
    const stale = spoken[0]
    engine.speak('Other.', 'en-AU')
    stale.onend?.()
    // The stale callback must not advance the new run.
    expect(engine.getStatus()).toEqual({ state: 'speaking', position: 1, total: 1 })
    finishLast()
    expect(engine.getStatus().state).toBe('idle')
  })

  it('does nothing for empty text', () => {
    const { engine, spoken } = fakeSynth()
    engine.speak('   ', 'en-AU')
    expect(spoken).toHaveLength(0)
    expect(engine.getStatus().state).toBe('idle')
  })
})

describe('pause and resume', () => {
  it('pauses while speaking and reports the paused state', () => {
    const { engine, calls } = fakeSynth()
    engine.speak('One. Two.', 'en-AU')
    engine.pause()
    expect(calls.pause).toBe(1)
    expect(engine.getStatus().state).toBe('paused')
  })

  it('resumes from where it paused, keeping its position', () => {
    const { engine, calls, finishLast } = fakeSynth()
    engine.speak('One. Two. Three.', 'en-AU')
    finishLast()
    engine.pause()
    expect(engine.getStatus().position).toBe(2)
    engine.resume()
    expect(calls.resume).toBe(1)
    expect(engine.getStatus()).toEqual({ state: 'speaking', position: 2, total: 3 })
  })

  it('ignores pause when nothing is speaking', () => {
    const { engine, calls } = fakeSynth()
    engine.pause()
    expect(calls.pause).toBe(0)
  })

  it('ignores resume when not paused', () => {
    const { engine, calls } = fakeSynth()
    engine.speak('One.', 'en-AU')
    engine.resume()
    expect(calls.resume).toBe(0)
  })
})

describe('replay', () => {
  it('starts the same text again from the first sentence', () => {
    const { engine, spoken, finishLast } = fakeSynth()
    engine.speak('One. Two.', 'en-AU')
    finishLast()
    expect(engine.getStatus().position).toBe(2)
    engine.replay()
    expect(spoken[spoken.length - 1].text).toBe('One.')
    expect(engine.getStatus()).toEqual({ state: 'speaking', position: 1, total: 2 })
  })

  it('replays after speech has finished naturally', () => {
    const { engine, finishLast } = fakeSynth()
    engine.speak('One. Two.', 'en-AU')
    finishLast()
    finishLast()
    expect(engine.getStatus().state).toBe('idle')
    engine.replay()
    expect(engine.getStatus()).toEqual({ state: 'speaking', position: 1, total: 2 })
  })

  it('does nothing when there is nothing to replay', () => {
    const { engine, spoken } = fakeSynth()
    engine.replay()
    expect(spoken).toHaveLength(0)
  })

  it('keeps the language it was given, not the page default', () => {
    const { engine, spoken } = fakeSynth([{ lang: 'ar-SA', name: 'Maged' }])
    engine.speak('مرحبا.', 'ar-SA')
    engine.replay()
    expect(spoken[spoken.length - 1].lang).toBe('ar-SA')
  })
})

describe('stop', () => {
  it('cancels and returns to idle', () => {
    const { engine, calls } = fakeSynth()
    engine.speak('One. Two.', 'en-AU')
    engine.stop()
    expect(calls.cancel).toBe(2)
    expect(engine.getStatus()).toEqual({ state: 'idle', position: 0, total: 0 })
  })

  it('stops a paused run too', () => {
    const { engine } = fakeSynth()
    engine.speak('One. Two.', 'en-AU')
    engine.pause()
    engine.stop()
    expect(engine.getStatus().state).toBe('idle')
  })
})

describe('subscribers', () => {
  it('receives the current status immediately on subscribe', () => {
    const { engine } = fakeSynth()
    const seen = track(engine)
    expect(seen[0]).toEqual({ state: 'idle', position: 0, total: 0 })
  })

  it('is notified on every transition', () => {
    const { engine, finishLast } = fakeSynth()
    const seen = track(engine)
    engine.speak('One. Two.', 'en-AU')
    engine.pause()
    engine.resume()
    finishLast()
    finishLast()
    expect(seen.map((s) => s.state)).toEqual([
      'idle', 'speaking', 'paused', 'speaking', 'speaking', 'idle',
    ])
  })

  it('stops notifying after unsubscribe', () => {
    const { engine } = fakeSynth()
    const seen: SpeechStatus[] = []
    const off = engine.subscribe((s) => seen.push(s))
    off()
    engine.speak('One.', 'en-AU')
    expect(seen).toHaveLength(1)
  })
})
