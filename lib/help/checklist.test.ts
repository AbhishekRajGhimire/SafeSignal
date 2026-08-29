import { describe, it, expect } from 'vitest'
import { buildChecklist } from './checklist'
import type { Warning } from '@/lib/domain/warning'
import { makeWarning } from '@/lib/testing/fixtures'

const warning = (rawAdvice: string | null): Warning =>
  makeWarning({
    id: 'demo',
    level: 'emergency-warning',
    updatedAt: null,
    publishedAt: null,
    point: null,
    officialUrl: 'https://example.invalid',
    rawAdvice,
  })

describe('buildChecklist', () => {
  it('leads with the plain-language action, marked as SafeSignal wording', () => {
    const items = buildChecklist(warning(null), 'en')
    expect(items[0].source).toBe('safesignal')
    expect(items[0].text).toBe('Do not wait. Follow the official advice below.')
  })

  it('splits the official advice into one step per sentence, tagged to the RFS', () => {
    const items = buildChecklist(
      warning('You are in danger. Leave now towards the east. Do not return.'),
      'en',
    )
    const official = items.filter((i) => i.source === 'nsw-rfs')
    expect(official.map((i) => i.text)).toEqual([
      'You are in danger.',
      'Leave now towards the east.',
      'Do not return.',
    ])
  })

  it('invents nothing when there is no official advice text', () => {
    const items = buildChecklist(warning(null), 'en')
    expect(items.filter((i) => i.source === 'nsw-rfs')).toHaveLength(0)
    expect(items).toHaveLength(1)
  })

  it('translates the plain-language line but leaves official sentences verbatim', () => {
    const items = buildChecklist(warning('Leave now towards the east.'), 'zh')
    expect(items[0].text).toBe('不要等待。请立即按照下面的官方指示行动。')
    expect(items[1].text).toBe('Leave now towards the east.')
  })

  it('returns an empty list when there is no warning', () => {
    expect(buildChecklist(null, 'en')).toEqual([])
  })

  it('ignores stray whitespace and empty sentence fragments', () => {
    const items = buildChecklist(warning('Leave now.   Stay away.  '), 'en')
    expect(items.filter((i) => i.source === 'nsw-rfs')).toHaveLength(2)
  })
})
