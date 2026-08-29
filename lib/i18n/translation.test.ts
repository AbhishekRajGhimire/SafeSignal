import { describe, it, expect } from 'vitest'
import {
  MAX_SOURCE_CHARS,
  SYSTEM_PROMPT,
  TRANSLATABLE,
  acceptTranslation,
  isTranslatable,
  normaliseDigits,
  numericTokens,
  readModelResponse,
  verifyTranslation,
} from './translation'
import { LANGUAGE_CODES } from '@/lib/domain/profile'

const SOURCE =
  'You are in danger and need to act immediately to survive. The fire is 2 km away and moving towards Katoomba. Call 000 if you are trapped.'

const model = (text: string) => ({
  content: [{ type: 'text', text }],
  model: 'claude-sonnet-5',
})

describe('a response the model ran out of room to finish', () => {
  // Observed in production: a 1500-character warning translated to Hindi
  // came back cut off mid-word, and was shown to the reader as if it were
  // the complete official advice.
  const truncated = (text: string) => ({ ...model(text), stop_reason: 'max_tokens' })

  it('rejects it even when the text looks like a plausible translation', () => {
    const outcome = readModelResponse(truncated('你现在有危险，需要立即采取行动。火距离 2 公里，正朝'))
    expect(outcome).toEqual({ status: 'unavailable', reason: 'truncated' })
  })

  it('rejects it through acceptTranslation too, not just the reader', () => {
    const outcome = acceptTranslation(SOURCE, truncated('你现在有危险，需要立即采取行动。'))
    expect(outcome).toEqual({ status: 'unavailable', reason: 'truncated' })
  })

  it('catches what the length guard cannot, because expansion hides truncation', () => {
    // Hindi runs longer than its English source, so a cut-off Hindi
    // translation still scores inside the accepted 0.2 to 6.0 ratio. The
    // length guard passes it; only stop_reason catches it.
    const cutOffHindi = 'आप खतरे में हैं और जीवित रहने के लिए अभी कार्रवाई करनी होगी। आग नज़दीक आ रही है और हाल'
    expect(verifyTranslation(SOURCE, cutOffHindi)).toBeNull()
    expect(acceptTranslation(SOURCE, truncated(cutOffHindi))).toEqual({
      status: 'unavailable',
      reason: 'truncated',
    })
  })

  it('still accepts a complete response that stopped naturally', () => {
    const complete = {
      ...model('你现在有危险，需要立即采取行动。火距离 2 公里，正朝 Katoomba 方向移动。如被困请拨打 000。'),
      stop_reason: 'end_turn',
    }
    expect(acceptTranslation(SOURCE, complete).status).toBe('translated')
  })
})

describe('successful translation', () => {
  it('accepts a faithful translation that preserves every number', () => {
    const candidate = '你现在有危险，需要立即采取行动。火距离 2 公里，正朝 Katoomba 方向移动。如被困请拨打 000。'
    const outcome = acceptTranslation(SOURCE, model(candidate))
    expect(outcome).toEqual({ status: 'translated', text: candidate })
  })

  it('accepts a translation that renders numbers in another numeral system', () => {
    // Arabic-Indic digits still have to match the source numerically.
    const candidate = 'أنت في خطر. الحريق على بُعد ٢ كم. اتصل على ٠٠٠ إذا كنت محاصراً.'
    expect(acceptTranslation(SOURCE, model(candidate)).status).toBe('translated')
  })

  it('trims surrounding whitespace from the model output', () => {
    const outcome = acceptTranslation('Leave now.', model('  Salga ahora.  '))
    expect(outcome).toEqual({ status: 'translated', text: 'Salga ahora.' })
  })
})

describe('translation failure', () => {
  it('reports a rejected translation rather than showing it', () => {
    const outcome = acceptTranslation(SOURCE, model('Call 112 for help.'))
    expect(outcome).toEqual({ status: 'unavailable', reason: 'rejected-unsafe' })
  })

  it('never returns partial or patched text when it rejects', () => {
    const outcome = acceptTranslation(SOURCE, model('Call 112.'))
    expect(outcome.status).toBe('unavailable')
    expect(outcome).not.toHaveProperty('text')
  })
})

describe('unsupported language', () => {
  it('accepts only the five languages with a pack and a model name', () => {
    expect([...TRANSLATABLE]).toEqual(['zh', 'ne', 'hi', 'ar', 'vi'])
  })

  it('never translates into English, which already has the official message', () => {
    expect(isTranslatable('en')).toBe(false)
  })

  it('never translates for a reader whose language we do not render', () => {
    expect(isTranslatable('other')).toBe(false)
  })

  it('rejects anything outside the offered set', () => {
    for (const code of LANGUAGE_CODES) {
      const expected = code !== 'en' && code !== 'other'
      expect(isTranslatable(code), code).toBe(expected)
    }
    expect(isTranslatable('klingon')).toBe(false)
    expect(isTranslatable('')).toBe(false)
  })
})

describe('empty response', () => {
  it('reports an empty text block as an empty response', () => {
    expect(readModelResponse(model(''))).toEqual({
      status: 'unavailable', reason: 'empty-response',
    })
  })

  it('treats whitespace-only output as empty', () => {
    expect(readModelResponse(model('   \n  '))).toEqual({
      status: 'unavailable', reason: 'empty-response',
    })
  })

  it('reports an empty content array as malformed, not as a translation', () => {
    expect(readModelResponse({ content: [] })).toEqual({
      status: 'unavailable', reason: 'malformed-response',
    })
  })
})

describe('malformed response', () => {
  it.each([
    [null],
    [undefined],
    ['a string'],
    [42],
    [{}],
    [{ content: 'not an array' }],
    [{ content: [{ type: 'tool_use', id: 'x' }] }],
    [{ content: [{ type: 'text' }] }],
    [{ content: [{ type: 'text', text: 123 }] }],
    [{ content: [null] }],
  ])('reports %j as malformed', (payload) => {
    expect(readModelResponse(payload)).toEqual({
      status: 'unavailable', reason: 'malformed-response',
    })
  })

  it('finds the text block even when other block types come first', () => {
    const payload = { content: [{ type: 'thinking', thinking: 'x' }, { type: 'text', text: 'Leave now.' }] }
    expect(readModelResponse(payload)).toEqual({ status: 'translated', text: 'Leave now.' })
  })
})

describe('the model may not change what the message says', () => {
  it('rejects an invented phone number', () => {
    expect(verifyTranslation('Call 000.', 'Call 000 or 112.')?.reason).toBe('invented-number')
  })

  it('rejects a changed distance', () => {
    expect(verifyTranslation('The fire is 2 km away.', 'The fire is 20 km away.')?.reason)
      .toBe('invented-number')
  })

  it('rejects a changed fire size', () => {
    expect(verifyTranslation('SIZE: 180 ha', 'SIZE: 1800 ha')?.reason).toBe('invented-number')
  })

  it('rejects an invented time', () => {
    expect(verifyTranslation('Leave now.', 'Leave before 6 pm.')?.reason).toBe('invented-number')
  })

  it('allows a number that is formatted differently but unchanged', () => {
    expect(verifyTranslation('Call 131 450.', 'Llame al 131450.')).toBeNull()
    expect(verifyTranslation('SIZE: 1,234 ha', 'Área: 1234 ha')).toBeNull()
  })

  it('allows a faithful translation that drops no numbers and adds none', () => {
    expect(verifyTranslation(SOURCE, 'Peligro. 2 km. Llame al 000.')).toBeNull()
  })

  it('rejects empty output', () => {
    expect(verifyTranslation('Leave now.', '')?.reason).toBe('empty')
    expect(verifyTranslation('Leave now.', '   ')?.reason).toBe('empty')
  })

  it('rejects output that is implausibly short or long for the source', () => {
    const source = 'You are in danger and need to act immediately to survive right now.'
    expect(verifyTranslation(source, 'Go.')?.reason).toBe('implausible-length')
    expect(verifyTranslation(source, 'x'.repeat(source.length * 7))?.reason)
      .toBe('implausible-length')
  })

  it('allows the wide length variation real languages produce', () => {
    const source = 'You are in danger and need to act immediately to survive.'
    // Chinese is far shorter than English; Hindi is far longer.
    expect(verifyTranslation(source, '你有危险，需要立即行动。')).toBeNull()
    expect(verifyTranslation(source, 'आप खतरे में हैं और आपको जीवित रहने के लिए तुरंत कार्रवाई करनी होगी।')).toBeNull()
  })
})

describe('numeric extraction', () => {
  it('normalises Arabic-Indic and Devanagari digits', () => {
    expect(normaliseDigits('٢٠٢٦')).toBe('2026')
    expect(normaliseDigits('२०२६')).toBe('2026')
  })

  it('strips separators so formatting does not create a false mismatch', () => {
    expect(numericTokens('Call 131 450 or 1,234')).toEqual(['131450', '1234'])
  })

  it('finds no tokens in text with no numbers', () => {
    expect(numericTokens('Leave now and go to a safe place.')).toEqual([])
  })
})

describe('the instruction given to the model', () => {
  it('forbids adding, removing or altering anything material', () => {
    for (const rule of [
      'Never add advice',
      'Never remove a safety instruction',
      'Never change a place name',
      'Copy every number exactly',
      'Never soften or strengthen the urgency',
      'Never translate an official alert level name',
    ]) {
      expect(SYSTEM_PROMPT, rule).toContain(rule)
    }
  })

  it('caps how much text may be sent at all', () => {
    expect(MAX_SOURCE_CHARS).toBeLessThanOrEqual(2_000)
  })
})
