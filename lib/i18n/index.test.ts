import { describe, it, expect } from 'vitest'
import {
  PACKS,
  getPack,
  SPEECH_LOCALE,
  speechLocaleOf,
  LANGUAGE_NAMES,
  LANGUAGE_IN_ENGLISH,
  UI_KEYS,
} from './index'
import { LANGUAGE_CODES, PACK_LANGUAGES, directionOf, packLanguage } from '@/lib/domain/profile'
import { ALERT_LEVELS } from '@/lib/domain/warning'

describe('phrase pack completeness', () => {
  it('has a pack for every language that declares one', () => {
    for (const code of PACK_LANGUAGES) {
      expect(PACKS[code], `missing pack: ${code}`).toBeDefined()
    }
  })

  it('defines every UI key in every language', () => {
    for (const code of PACK_LANGUAGES) {
      for (const key of UI_KEYS) {
        const value = PACKS[code].ui[key]
        expect(typeof value, `${code}.ui.${key} is not a string`).toBe('string')
        expect(value.length, `${code}.ui.${key} is empty`).toBeGreaterThan(0)
      }
    }
  })

  it('defines a name, meaning, and action for every alert level in every language', () => {
    for (const code of PACK_LANGUAGES) {
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
    for (const code of PACK_LANGUAGES) {
      expect(Object.keys(PACKS[code].statusValues).sort(), code).toEqual(expectedStatus)
      expect(Object.keys(PACKS[code].typeValues).sort(), code).toEqual(expectedType)
    }
  })

  it('defines every field label in every language', () => {
    const expected = Object.keys(PACKS.en.fields).sort()
    for (const code of PACK_LANGUAGES) {
      expect(Object.keys(PACKS[code].fields).sort(), code).toEqual(expected)
    }
  })

  it('covers every status and type the live RFS feed actually emits', () => {
    // Observed in a full feed snapshot on 2026-08-29. The packs were first
    // written from a single sample feature and missed most of this, which
    // showed up as untranslated English inside an otherwise translated screen.
    const liveStatuses = ['out of control', 'not yet controlled', 'being controlled', 'under control']
    const liveTypes = [
      'bush fire', 'grass fire', 'structure fire',
      'burn off', 'hazard reduction', 'planned event', 'haystack fire', 'other',
    ]

    for (const code of PACK_LANGUAGES) {
      for (const status of liveStatuses) {
        expect(PACKS[code].statusValues[status], `${code}.statusValues["${status}"]`).toBeTruthy()
      }
      for (const type of liveTypes) {
        expect(PACKS[code].typeValues[type], `${code}.typeValues["${type}"]`).toBeTruthy()
      }
    }
  })

  it('does not leave non-English packs identical to English', () => {
    for (const code of PACK_LANGUAGES) {
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

  it('renders "other" in English rather than failing', () => {
    expect(getPack('other')).toBe(PACKS.en)
    expect(packLanguage('other')).toBe('en')
  })

  it('never returns undefined for any selectable language', () => {
    for (const code of LANGUAGE_CODES) {
      expect(getPack(code), code).toBeDefined()
    }
  })
})

describe('text direction', () => {
  it('marks Arabic right-to-left and everything else left-to-right', () => {
    expect(directionOf('ar')).toBe('rtl')
    for (const code of LANGUAGE_CODES) {
      if (code === 'ar') continue
      expect(directionOf(code), code).toBe('ltr')
    }
  })
})

describe('locale metadata', () => {
  it('has a BCP 47 speech locale for every language', () => {
    for (const code of PACK_LANGUAGES) {
      expect(SPEECH_LOCALE[code], code).toMatch(/^[a-z]{2}(-[A-Za-z]{2,4})+$/)
    }
  })

  it('names every language in that language', () => {
    for (const code of PACK_LANGUAGES) {
      expect(LANGUAGE_NAMES[code], code).toBeTruthy()
    }
    expect(LANGUAGE_NAMES.zh).not.toBe('Chinese')
    expect(LANGUAGE_NAMES.ar).not.toBe('Arabic')
    expect(LANGUAGE_NAMES.ne).not.toBe('Nepali')
  })

  it('has an English name for every language, for the operator to hear', () => {
    for (const code of PACK_LANGUAGES) {
      expect(LANGUAGE_IN_ENGLISH[code], code).toMatch(/^[A-Z][a-z]+$/)
    }
  })

  it('resolves a speech locale for every selectable language', () => {
    for (const code of LANGUAGE_CODES) {
      expect(speechLocaleOf(code), code).toMatch(/^[a-z]{2}(-[A-Za-z]{2,4})+$/)
    }
    expect(speechLocaleOf('other')).toBe(SPEECH_LOCALE.en)
  })
})
