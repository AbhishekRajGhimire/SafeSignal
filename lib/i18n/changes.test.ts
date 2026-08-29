import { describe, it, expect } from 'vitest'
import { renderChangeDetail, renderChangeSummary } from './changes'
import { PACKS } from './index'
import { LANGUAGE_CODES, PACK_LANGUAGES } from '@/lib/domain/profile'
import type { ChangeDetail } from '@/lib/domain/changeSummary'

const EVERY_DETAIL: ChangeDetail[] = [
  { kind: 'level', from: 'advice', to: 'emergency-warning', escalated: true },
  { kind: 'status', from: 'Being controlled', to: 'Out of control' },
  { kind: 'size', fromHa: 120, toHa: 840 },
  { kind: 'area' },
  { kind: 'time', updatedAt: new Date('2026-08-30T04:12:00.000Z') },
  { kind: 'unspecified' },
]

describe('renderChangeDetail', () => {
  it('names both official levels, translated', () => {
    const detail = EVERY_DETAIL[0]
    expect(renderChangeDetail(detail, 'en'))
      .toBe('The warning level changed from Advice to Emergency Warning.')
    const zh = renderChangeDetail(detail, 'zh')
    expect(zh).toContain(PACKS.zh.levelName.advice)
    expect(zh).toContain(PACKS.zh.levelName['emergency-warning'])
  })

  it('translates the statuses through the same vocabulary as the warning itself', () => {
    const detail = EVERY_DETAIL[1]
    const zh = renderChangeDetail(detail, 'zh')
    expect(zh).toContain(PACKS.zh.statusValues['being controlled'])
    expect(zh).toContain(PACKS.zh.statusValues['out of control'])
  })

  it('keeps an unknown status verbatim rather than dropping it', () => {
    const line = renderChangeDetail(
      { kind: 'status', from: 'Newly invented status', to: 'Out of control' },
      'en',
    )
    expect(line).toContain('Newly invented status')
  })

  it('states sizes with their unit', () => {
    expect(renderChangeDetail(EVERY_DETAIL[2], 'en'))
      .toBe('The fire size changed from 120 ha to 840 ha.')
  })

  it('states the area changed without a direction or a trend', () => {
    const line = renderChangeDetail(EVERY_DETAIL[3], 'en')
    expect(line).toBe('The mapped warning area changed.')
    expect(line.toLowerCase()).not.toMatch(/grow|bigger|toward|closer|spread/)
  })

  it('renders the official time in Sydney time', () => {
    // 04:12 UTC on 30 Aug is 14:12 in Sydney (AEST +10).
    expect(renderChangeDetail(EVERY_DETAIL[4], 'en')).toContain('14:12')
  })

  it('leaves no unfilled placeholder in any language for any detail', () => {
    for (const language of LANGUAGE_CODES) {
      for (const detail of EVERY_DETAIL) {
        const line = renderChangeDetail(detail, language)
        expect(line, `${language}/${detail.kind}`).not.toMatch(/\{\w+\}/)
        expect(line.length, `${language}/${detail.kind}`).toBeGreaterThan(0)
      }
    }
  })
})

describe('renderChangeSummary', () => {
  it('falls back to the generic line when nothing could be described', () => {
    expect(renderChangeSummary([], 'en')).toEqual(['Official warning updated.'])
    expect(renderChangeSummary([{ kind: 'unspecified' }], 'en'))
      .toEqual(['Official warning updated.'])
  })

  it('puts confident lines first and the generic line last when both exist', () => {
    const lines = renderChangeSummary(
      [{ kind: 'unspecified' }, EVERY_DETAIL[0]],
      'en',
    )
    expect(lines).toHaveLength(2)
    expect(lines[0]).toContain('warning level')
    expect(lines[1]).toBe('Official warning updated.')
  })

  it('never repeats the generic line', () => {
    const lines = renderChangeSummary(
      [{ kind: 'unspecified' }, { kind: 'unspecified' }],
      'en',
    )
    expect(lines).toEqual(['Official warning updated.'])
  })
})

describe('change descriptions never instruct', () => {
  it('contains no imperative emergency language in the English change strings', () => {
    const keys = [
      'officialWarningUpdated', 'changeLevel', 'changeArea',
      'changeStatus', 'changeSize', 'changeTime',
    ] as const
    const forbidden = /\b(leave|evacuate|go to|call|do not wait|act now|move|flee)\b/i
    for (const key of keys) {
      expect(PACKS.en.ui[key], key).not.toMatch(forbidden)
    }
  })

  it('describes rather than commands in every language', () => {
    for (const language of PACK_LANGUAGES) {
      // Every change string is a statement ending in a full stop or its
      // script's equivalent, never an exclamation.
      for (const key of ['changeLevel', 'changeArea', 'changeStatus', 'changeSize'] as const) {
        expect(PACKS[language].ui[key], `${language}.${key}`).not.toContain('!')
      }
    }
  })
})
