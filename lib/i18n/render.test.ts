import { describe, it, expect } from 'vitest'
import { renderWarning } from './render'
import type { RelevantWarning } from '@/lib/domain/match'
import { makeWarning } from '@/lib/testing/fixtures'

const relevant: RelevantWarning = {
  warning: {
    id: 'incident-1',
    level: 'watch-and-act',
    title: 'GREEN GULLY TRAIL, KATOOMBA',
    location: 'Green Gully Trail, Katoomba',
    council: 'Blue Mountains',
    status: 'Out of control',
    type: 'Bush Fire',
    sizeHa: 180,
    agency: 'Rural Fire Service',
    updatedAt: new Date('2026-11-14T03:22:00.000Z'),
    publishedAt: new Date('2026-11-14T03:00:00.000Z'),
    point: { lat: -33.67, lon: 150.31 },
    polygons: [],
    officialUrl: 'https://www.rfs.nsw.gov.au/fire-information/fires-near-me',
    rawAdvice: 'Conditions are changing and the fire is moving towards the area.',
    fields: {},
    raw: { properties: {}, geometry: null },
    provenance: makeWarning().provenance,
  },
  distanceKm: 4.8,
  inside: false,
  band: 'very-close',
  verdict: 'not-currently-affected' as const,
  reason: 'outside-polygon' as const,
  rejectedRings: 0,
}

describe('renderWarning', () => {
  it('renders the official label and the plain meaning separately', () => {
    const r = renderWarning(relevant, 'en')
    expect(r.levelName).toBe('Watch and Act')
    expect(r.levelMeaning).toBe('A fire is close. Get ready to leave now.')
  })

  it('translates the label and meaning', () => {
    const r = renderWarning(relevant, 'vi')
    expect(r.levelName).toBe('Theo dõi và hành động')
    expect(r.levelMeaning).toBe('Đám cháy đang ở gần. Hãy chuẩn bị rời đi ngay.')
  })

  it('translates the RFS status string', () => {
    expect(renderWarning(relevant, 'en').statusText).toBe('The fire is not under control.')
    expect(renderWarning(relevant, 'zh').statusText).toBe('火势尚未得到控制。')
  })

  it('falls back to the raw status when the value is not in the pack', () => {
    const unknown = { ...relevant, warning: { ...relevant.warning, status: 'Patrolled' } }
    expect(renderWarning(unknown, 'zh').statusText).toBe('Patrolled')
  })

  it('renders distance in the chosen language', () => {
    expect(renderWarning(relevant, 'en').distanceText).toBe('4.8 km away')
    expect(renderWarning(relevant, 'zh').distanceText).toBe('4.8 公里外')
  })

  it('says the user is inside rather than giving a distance', () => {
    const inside = { ...relevant, inside: true, band: 'inside' as const }
    expect(renderWarning(inside, 'en').distanceText).toBe('You are inside the fire area.')
  })

  it('gives no distance text when the location is unknown', () => {
    const unknown = { ...relevant, distanceKm: null, band: 'unknown' as const }
    expect(renderWarning(unknown, 'en').distanceText).toBeNull()
  })

  it('rebuilds the official English wording regardless of chosen language', () => {
    const r = renderWarning(relevant, 'hi')
    expect(r.officialText).toContain('ALERT LEVEL: Watch and Act')
    expect(r.officialText).toContain('LOCATION: Green Gully Trail, Katoomba')
    expect(r.officialText).toContain('STATUS: Out of control')
    expect(r.officialText).toContain('Conditions are changing')
  })

  it('formats the update time as Sydney local time', () => {
    // 03:22 UTC on 14 Nov is 14:22 in Sydney (AEDT).
    expect(renderWarning(relevant, 'en').updatedText).toContain('14:22')
  })

  it('formats the date in the reader\'s language, not always English', () => {
    // The locale was hardcoded to en-GB, so every language printed English
    // month names inside an otherwise translated screen.
    for (const language of ['en', 'zh', 'hi', 'vi'] as const) {
      expect(renderWarning(relevant, language).updatedText, language).toContain('14:22')
    }
    expect(renderWarning(relevant, 'zh').updatedText).toContain('11月')
    expect(renderWarning(relevant, 'en').updatedText).toContain('Nov')
    expect(renderWarning(relevant, 'zh').updatedText).not.toContain('Nov')
  })

  it('keeps the place name and council in English so they can be acted on', () => {
    // A translated street name cannot be matched to a road sign or read to
    // a 000 operator. The UI labels it instead of translating it.
    const r = renderWarning(relevant, 'zh')
    expect(r.placeText).toBe('Green Gully Trail, Katoomba')
    expect(r.councilText).toBe('Blue Mountains')
  })

  it('builds speech text from the meaning and the action, not the jargon', () => {
    const r = renderWarning(relevant, 'en')
    expect(r.speechText).toContain('A fire is close.')
    expect(r.speechText).toContain('Get ready to leave.')
    expect(r.speechLocale).toBe('en-AU')
  })

  it('handles a warning with no update time', () => {
    const undated = { ...relevant, warning: { ...relevant.warning, updatedAt: null } }
    expect(renderWarning(undated, 'en').updatedText).toBeNull()
  })
})
