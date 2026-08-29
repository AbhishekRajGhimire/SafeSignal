import { describe, it, expect } from 'vitest'
import { PACKS, getPack, SPEECH_LOCALE, LANGUAGE_NAMES, UI_KEYS } from './index'
import { LANGUAGE_CODES } from '@/lib/domain/profile'
import { ALERT_LEVELS } from '@/lib/domain/warning'

describe('phrase pack completeness', () => {
  it('has a pack for every supported language', () => {
    for (const code of LANGUAGE_CODES) {
      expect(PACKS[code], `missing pack: ${code}`).toBeDefined()
    }
  })

  it('defines every UI key in every language', () => {
    for (const code of LANGUAGE_CODES) {
      for (const key of UI_KEYS) {
        const value = PACKS[code].ui[key]
        expect(typeof value, `${code}.ui.${key} is not a string`).toBe('string')
        expect(value.length, `${code}.ui.${key} is empty`).toBeGreaterThan(0)
      }
    }
  })

  it('defines a name, meaning, and action for every alert level in every language', () => {
    for (const code of LANGUAGE_CODES) {
      for (const level of ALERT_LEVELS) {
        expect(PACKS[code].levelName[level], `${code}.levelName.${level}`).toBeTruthy()
        expect(PACKS[code].levelMeaning[level], `${code}.levelMeaning.${level}`).toBeTruthy()
        expect(PACKS[code].levelAction[level], `${code}.levelAction.${level}`).toBeTruthy()
      }
    }
  })

  it('defines the same status and type keys in every language', () => {
    const expectedStatus = Object.keys(PACKS.en.statusValues).sort()
    const expectedType = Object.keys(PACKS.en.typeValues).sort()
    for (const code of LANGUAGE_CODES) {
      expect(Object.keys(PACKS[code].statusValues).sort(), code).toEqual(expectedStatus)
      expect(Object.keys(PACKS[code].typeValues).sort(), code).toEqual(expectedType)
    }
  })

  it('defines every field label in every language', () => {
    const expected = Object.keys(PACKS.en.fields).sort()
    for (const code of LANGUAGE_CODES) {
      expect(Object.keys(PACKS[code].fields).sort(), code).toEqual(expected)
    }
  })

  it('does not leave non-English packs identical to English', () => {
    for (const code of LANGUAGE_CODES) {
      if (code === 'en') continue
      expect(PACKS[code].levelMeaning['emergency-warning'], code)
        .not.toBe(PACKS.en.levelMeaning['emergency-warning'])
    }
  })
})

describe('getPack', () => {
  it('returns the requested pack', () => {
    expect(getPack('vi')).toBe(PACKS.vi)
  })
})

describe('locale metadata', () => {
  it('has a BCP 47 speech locale for every language', () => {
    for (const code of LANGUAGE_CODES) {
      expect(SPEECH_LOCALE[code], code).toMatch(/^[a-z]{2}(-[A-Za-z]{2,4})+$/)
    }
  })

  it('names every language in that language', () => {
    for (const code of LANGUAGE_CODES) {
      expect(LANGUAGE_NAMES[code], code).toBeTruthy()
    }
    expect(LANGUAGE_NAMES.zh).not.toBe('Chinese')
  })
})
