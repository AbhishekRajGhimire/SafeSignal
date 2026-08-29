/**
 * Speech engine.
 *
 * Reads SafeSignal's accessible rendering aloud. It never reads anything the
 * text on screen does not also say, and it never becomes the only way to
 * receive a warning: the text is always present, and audio is additive.
 *
 * The browser API is injected rather than reached for, so the state machine
 * can be tested without a browser.
 */

export type SpeechState = 'idle' | 'speaking' | 'paused'

export interface VoiceLike {
  lang: string
  name: string
}

export interface UtteranceLike {
  text: string
  lang: string
  rate: number
  voice: VoiceLike | null
  onend: (() => void) | null
  onerror: ((event: unknown) => void) | null
}

export interface SynthLike {
  speak(utterance: UtteranceLike): void
  cancel(): void
  pause(): void
  resume(): void
  getVoices(): VoiceLike[]
}

export type UtteranceFactory = (text: string) => UtteranceLike

/** Slower than default. Comprehension matters more than speed here. */
export const RATE = 0.9

/** Beyond this, Chrome has historically truncated a single utterance. */
const MAX_CHUNK = 200

const SENTENCE_END = /([.!?。！？।؟])/

/**
 * Splits text into utterance-sized pieces at sentence boundaries.
 *
 * Chunking is not cosmetic. A single long utterance is cut off partway
 * through in some browsers, which would mean a warning that stops speaking
 * halfway. It also gives the interface something honest to show: which
 * sentence is being read.
 */
export function splitForSpeech(text: string): string[] {
  const trimmed = text.trim()
  if (!trimmed) return []

  const parts = trimmed.split(SENTENCE_END)
  const sentences: string[] = []

  for (let i = 0; i < parts.length; i += 2) {
    const body = parts[i] ?? ''
    const terminator = parts[i + 1] ?? ''
    const sentence = (body + terminator).trim()
    if (sentence) sentences.push(sentence)
  }

  const chunks: string[] = []
  for (const sentence of sentences.length > 0 ? sentences : [trimmed]) {
    if (sentence.length <= MAX_CHUNK) {
      chunks.push(sentence)
      continue
    }
    // A sentence longer than the safe length is broken at spaces rather
    // than mid-word.
    let remaining = sentence
    while (remaining.length > MAX_CHUNK) {
      const cut = remaining.lastIndexOf(' ', MAX_CHUNK)
      const at = cut > MAX_CHUNK / 2 ? cut : MAX_CHUNK
      chunks.push(remaining.slice(0, at).trim())
      remaining = remaining.slice(at).trim()
    }
    if (remaining) chunks.push(remaining)
  }

  return chunks.filter((c) => c.length > 0)
}

const baseLanguage = (tag: string): string =>
  tag.replace('_', '-').split('-')[0].toLowerCase()

export function pickVoice(voices: VoiceLike[], locale: string): VoiceLike | null {
  const wanted = locale.replace('_', '-').toLowerCase()
  const exact = voices.find((v) => v.lang.replace('_', '-').toLowerCase() === wanted)
  if (exact) return exact
  const sameLanguage = voices.find((v) => baseLanguage(v.lang) === baseLanguage(locale))
  return sameLanguage ?? null
}

export interface SpeechStatus {
  state: SpeechState
  /** 1-based index of the sentence being read. 0 when idle. */
  position: number
  total: number
}

const IDLE: SpeechStatus = { state: 'idle', position: 0, total: 0 }

export class SpeechEngine {
  private chunks: string[] = []
  private index = 0
  private status: SpeechStatus = IDLE
  private locale = 'en-AU'
  private readonly listeners = new Set<(status: SpeechStatus) => void>()
  /** Guards against a cancelled utterance's onend advancing the new run. */
  private run = 0

  constructor(
    private readonly synth: SynthLike,
    private readonly makeUtterance: UtteranceFactory,
  ) {}

  getStatus(): SpeechStatus {
    return this.status
  }

  subscribe(listener: (status: SpeechStatus) => void): () => void {
    this.listeners.add(listener)
    listener(this.status)
    return () => {
      this.listeners.delete(listener)
    }
  }

  speak(text: string, locale: string): void {
    const chunks = splitForSpeech(text)
    if (chunks.length === 0) {
      this.reset()
      return
    }
    // Cancel first: queued utterances otherwise stack up on repeated taps.
    this.synth.cancel()
    this.run += 1
    this.chunks = chunks
    this.index = 0
    this.locale = locale
    this.emit({ state: 'speaking', position: 1, total: chunks.length })
    this.speakCurrent()
  }

  /** Starts the same text again from the first sentence. */
  replay(): void {
    if (this.chunks.length === 0) return
    const text = this.chunks.join(' ')
    this.speak(text, this.locale)
  }

  pause(): void {
    if (this.status.state !== 'speaking') return
    this.synth.pause()
    this.emit({ ...this.status, state: 'paused' })
  }

  resume(): void {
    if (this.status.state !== 'paused') return
    this.synth.resume()
    this.emit({ ...this.status, state: 'speaking' })
  }

  stop(): void {
    this.run += 1
    this.synth.cancel()
    this.reset()
  }

  /** Keeps the text, so replay still works after a natural finish. */
  private finish(): void {
    this.emit({ state: 'idle', position: 0, total: this.chunks.length })
  }

  private reset(): void {
    this.chunks = []
    this.index = 0
    this.emit(IDLE)
  }

  private speakCurrent(): void {
    const run = this.run
    const chunk = this.chunks[this.index]
    if (chunk === undefined) {
      this.finish()
      return
    }

    const utterance = this.makeUtterance(chunk)
    utterance.lang = this.locale
    utterance.rate = RATE
    utterance.voice = pickVoice(this.synth.getVoices(), this.locale)

    const advance = () => {
      // A late callback from a cancelled run must not move the new one on.
      if (run !== this.run) return
      this.index += 1
      if (this.index >= this.chunks.length) {
        this.finish()
        return
      }
      this.emit({ state: 'speaking', position: this.index + 1, total: this.chunks.length })
      this.speakCurrent()
    }

    utterance.onend = advance
    // A failed chunk must not strand the rest of the warning unspoken.
    utterance.onerror = advance

    this.synth.speak(utterance)
  }

  private emit(status: SpeechStatus): void {
    this.status = status
    for (const listener of this.listeners) listener(status)
  }
}
