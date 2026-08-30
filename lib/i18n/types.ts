import type { AlertLevel } from '@/lib/domain/warning'

export const UI_KEYS = [
  // Warning screen
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
  'switchToLive',
  'switchToDemo',
  'kmAway',
  'youAreInside',
  'changeSettings',
  'whatToDo',
  'whatToSay',
  'shareSituation',
  'otherServices',
  'sourceRfs',
  // Intro screen
  'introTagline',
  'introChooseLanguage',
  'introForTitle',
  'introForLanguage',
  'introForText',
  'introForHelp',
  // Setup: framing
  'setupTitle',
  'setupIntro',
  'setupReassure',
  'saveAndContinue',
  'stepWord',
  'ofWord',
  'back',
  'next',
  'finish',
  'selectedMarker',
  'selectAllThatApply',
  // Setup: language
  'qLanguage',
  'qLanguageHelp',
  'languageOther',
  'languageOtherHelp',
  // Setup: text size
  'qTextSize',
  'qTextSizeHelp',
  'textStandard',
  'textLarge',
  'textXLarge',
  'textPreview',
  // Setup: audio
  'qAudio',
  'qAudioHelp',
  'audioOn',
  'audioOff',
  // Setup: accessibility needs
  'qNeeds',
  'qNeedsHelp',
  'needMobility',
  'needLowVision',
  'needHearing',
  'needCognitive',
  'needSimpler',
  'needNone',
  // Setup: transport
  'qTransport',
  'qTransportHelp',
  'transportCar',
  'transportPublic',
  'transportTaxi',
  'transportAccessible',
  'transportAssistance',
  'transportUnsure',
  // Setup: location
  'qLocation',
  'qLocationHelp',
  'useMyLocation',
  'searchPlace',
  'locationRequired',
  'locationDenied',
  'locationChosen',
  'placesFound',
  'noPlacesFound',
  // Relevance verdicts
  'statusAffected',
  'statusNotAffected',
  'statusNotAffectedBody',
  'statusUndetermined',
  'statusUnavailable',
  'reasonNoLocation',
  'reasonNoMapArea',
  'reasonUnreadableArea',
  'reasonOutOfDate',
  'reasonNoData',
  'checkOfficial',
  'loadingTitle',
  'warningChanged',
  'otherWarnings',
  'officialMessageLabel',
  'explanationLabel',
  'explanationNote',
  'translationUnavailable',
  'sourceLabel',
  'pause',
  'resume',
  'replay',
  'paused',
  'readingAloud',
  'speechNotSupported',
  'warningUpdatedTitle',
  'whatChanged',
  'officialWarningUpdated',
  'changeLevel',
  'changeArea',
  'changeStatus',
  'changeSize',
  'changeTime',
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
