import { describe, it, expect } from 'vitest'
import { parseDescription, parsePubDate, parseUpdated, parseSizeHa } from './parse'

const REAL = [
  'ALERT LEVEL: Advice ',
  'LOCATION: ALTINIER RD, TUNCESTER 2480 ',
  'COUNCIL AREA: Lismore ',
  'STATUS: Under control ',
  'TYPE: Grass Fire ',
  'FIRE: Yes ',
  'SIZE: 0 ha ',
  'RESPONSIBLE AGENCY: Rural Fire Service ',
  'UPDATED: 29 Aug 2026 14:12',
].join('<br />')

describe('parseDescription', () => {
  it('reads every key from a real feed description', () => {
    const f = parseDescription(REAL)
    expect(f['ALERT LEVEL']).toBe('Advice')
    expect(f['LOCATION']).toBe('ALTINIER RD, TUNCESTER 2480')
    expect(f['COUNCIL AREA']).toBe('Lismore')
    expect(f['STATUS']).toBe('Under control')
    expect(f['SIZE']).toBe('0 ha')
    expect(f['UPDATED']).toBe('29 Aug 2026 14:12')
  })

  it('keeps values that themselves contain a colon', () => {
    expect(parseDescription('UPDATED: 29 Aug 2026 14:12')['UPDATED'])
      .toBe('29 Aug 2026 14:12')
  })

  it('retains keys it does not recognise', () => {
    expect(parseDescription('NEW FIELD: hello')['NEW FIELD']).toBe('hello')
  })

  it('tolerates break tag variants', () => {
    const f = parseDescription('A: 1<br/>B: 2<BR />C: 3<br>D: 4')
    expect(f).toEqual({ A: '1', B: '2', C: '3', D: '4' })
  })

  it('returns an empty object for empty or junk input', () => {
    expect(parseDescription('')).toEqual({})
    expect(parseDescription('no colon here')).toEqual({})
  })
})

describe('parsePubDate', () => {
  it('reads the day-first format rather than month-first', () => {
    // 29/08 is 29 August, NOT 8 September
    const d = parsePubDate('29/08/2026 4:12:00 AM')
    expect(d?.toISOString()).toBe('2026-08-28T18:12:00.000Z')
  })

  it('handles PM correctly', () => {
    const d = parsePubDate('29/08/2026 4:12:00 PM')
    expect(d?.toISOString()).toBe('2026-08-29T06:12:00.000Z')
  })

  it('treats 12 AM as midnight and 12 PM as noon', () => {
    expect(parsePubDate('01/07/2026 12:00:00 AM')?.toISOString())
      .toBe('2026-06-30T14:00:00.000Z')
    expect(parsePubDate('01/07/2026 12:00:00 PM')?.toISOString())
      .toBe('2026-07-01T02:00:00.000Z')
  })

  it('returns null rather than throwing on junk', () => {
    expect(parsePubDate('not a date')).toBeNull()
    expect(parsePubDate(undefined)).toBeNull()
  })
})

describe('parseUpdated', () => {
  it('reads the abbreviated-month 24-hour format', () => {
    expect(parseUpdated('29 Aug 2026 14:12')?.toISOString())
      .toBe('2026-08-29T04:12:00.000Z')
  })

  it('returns null rather than throwing on junk', () => {
    expect(parseUpdated('29 Xxx 2026 14:12')).toBeNull()
    expect(parseUpdated(undefined)).toBeNull()
  })
})

describe('parseSizeHa', () => {
  it('reads plain and comma-grouped hectare values', () => {
    expect(parseSizeHa('0 ha')).toBe(0)
    expect(parseSizeHa('1,234 ha')).toBe(1234)
    expect(parseSizeHa('12.5 ha')).toBe(12.5)
  })

  it('returns null when there is no number', () => {
    expect(parseSizeHa('unknown')).toBeNull()
    expect(parseSizeHa(undefined)).toBeNull()
  })
})
