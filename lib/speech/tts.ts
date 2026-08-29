export interface SpeechCapability {
  supported: boolean
  hasVoice: boolean
}

/** Slower than default. Comprehension matters more than speed here. */
const RATE = 0.9

const baseLanguage = (tag: string): string =>
  tag.replace('_', '-').split('-')[0].toLowerCase()

export function pickVoice(
  voices: SpeechSynthesisVoice[],
  locale: string,
): SpeechSynthesisVoice | null {
  const wanted = locale.replace('_', '-').toLowerCase()
  const exact = voices.find((v) => v.lang.replace('_', '-').toLowerCase() === wanted)
  if (exact) return exact

  const sameLanguage = voices.find((v) => baseLanguage(v.lang) === baseLanguage(locale))
  return sameLanguage ?? null
}

/**
 * Chrome populates the voice list asynchronously, so the first getVoices()
 * call returns an empty array. Waits for voiceschanged, with a timeout so a
 * browser that never fires it cannot hang the caller.
 */
export function getVoicesAsync(timeoutMs = 1500): Promise<SpeechSynthesisVoice[]> {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return Promise.resolve([])
  }

  const synth = window.speechSynthesis
  const immediate = synth.getVoices()
  if (immediate.length > 0) return Promise.resolve(immediate)

  return new Promise((resolve) => {
    let settled = false

    const finish = () => {
      if (settled) return
      settled = true
      synth.removeEventListener('voiceschanged', finish)
      resolve(synth.getVoices())
    }

    synth.addEventListener('voiceschanged', finish)
    setTimeout(finish, timeoutMs)
  })
}

export async function checkCapability(locale: string): Promise<SpeechCapability> {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return { supported: false, hasVoice: false }
  }
  const voices = await getVoicesAsync()
  return { supported: true, hasVoice: pickVoice(voices, locale) !== null }
}

export function stopSpeaking(): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
}

export async function speak(text: string, locale: string): Promise<void> {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
  if (!text.trim()) return

  const voices = await getVoicesAsync()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = locale
  utterance.rate = RATE

  const voice = pickVoice(voices, locale)
  if (voice) utterance.voice = voice

  // Cancel first: queued utterances otherwise stack up on repeated taps.
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(utterance)
}
