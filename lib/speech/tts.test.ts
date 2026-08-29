import { describe, it, expect } from 'vitest'
import { pickVoice } from './tts'

const voice = (lang: string, name = lang): SpeechSynthesisVoice =>
  ({ lang, name, default: false, localService: true, voiceURI: name }) as SpeechSynthesisVoice

describe('pickVoice', () => {
  it('prefers an exact locale match', () => {
    const voices = [voice('en-US'), voice('zh-CN'), voice('zh-TW')]
    expect(pickVoice(voices, 'zh-CN')?.lang).toBe('zh-CN')
  })

  it('falls back to the same base language when the region differs', () => {
    const voices = [voice('en-US'), voice('zh-TW')]
    expect(pickVoice(voices, 'zh-CN')?.lang).toBe('zh-TW')
  })

  it('accepts underscore-separated tags, which some Android builds report', () => {
    expect(pickVoice([voice('hi_IN')], 'hi-IN')?.lang).toBe('hi_IN')
  })

  it('returns null when no voice matches the language at all', () => {
    expect(pickVoice([voice('en-US'), voice('fr-FR')], 'vi-VN')).toBeNull()
  })

  it('returns null for an empty voice list rather than throwing', () => {
    expect(pickVoice([], 'en-AU')).toBeNull()
  })
})
