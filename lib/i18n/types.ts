import type { AlertLevel } from '@/lib/domain/warning'

export const UI_KEYS = [
  'yourArea',
  'noWarningsTitle',
  'noWarningsBody',
  'officialWording',
  'viewOfficial',
  'listen',
  'stopListening',
  'audioUnavailable',
  'getHelp',
  'callNow',
  'dataAsOf',
  'offlineNotice',
  'demoBanner',
  'kmAway',
  'youAreInside',
  'setupTitle',
  'setupIntro',
  'chooseLanguage',
  'whereYouLive',
  'searchPlace',
  'useMyLocation',
  'mobilityQuestion',
  'transportQuestion',
  'largeTextLabel',
  'audioLabel',
  'saveAndContinue',
  'changeSettings',
  'whatToDo',
  'whatToSay',
  'shareSituation',
  'sourceRfs',
  'mobilityNone',
  'mobilityLimited',
  'mobilityWheelchair',
  'mobilityBedbound',
  'transportOwnCar',
  'transportLift',
  'transportNone',
] as const

export type UIKey = (typeof UI_KEYS)[number]

export interface PhrasePack {
  /** The official label. May be unfamiliar to a newcomer. */
  levelName: Record<AlertLevel, string>
  /** What the label actually means for this person. */
  levelMeaning: Record<AlertLevel, string>
  /** What to do about it, in plain words. */
  levelAction: Record<AlertLevel, string>
  /** Keyed on the lowercased raw RFS status string. */
  statusValues: Record<string, string>
  /** Keyed on the lowercased raw RFS type string. */
  typeValues: Record<string, string>
  fields: {
    location: string
    council: string
    status: string
    size: string
    updated: string
    agency: string
  }
  ui: Record<UIKey, string>
}
