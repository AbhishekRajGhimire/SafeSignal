import type { RelevantWarning } from '@/lib/domain/match'
import type { LanguageCode } from '@/lib/domain/profile'
import { getPack, speechLocaleOf } from './index'

export interface RenderedWarning {
  /** The official label, which may be unfamiliar. */
  levelName: string
  /** What the label means, in plain words. */
  levelMeaning: string
  /** What to do about it. */
  levelAction: string
  /** Kept in English on purpose: see the note on `placeText` below. */
  placeText: string
  councilText: string
  statusText: string
  typeText: string
  sizeText: string | null
  distanceText: string | null
  updatedText: string | null
  /** The exact official English wording, always shown beneath the above. */
  officialText: string
  officialUrl: string
  speechText: string
  speechLocale: string
}

const OFFICIAL_LEVEL: Record<string, string> = {
  'emergency-warning': 'Emergency Warning',
  'watch-and-act': 'Watch and Act',
  advice: 'Advice',
  'planned-burn': 'Planned Burn',
  'not-applicable': 'Not Applicable',
}

/**
 * Formatted in the user's own language, not en-GB. Hardcoding the locale
 * printed English month names ("14 Nov") inside an otherwise translated
 * screen. Formatters are memoised because constructing one is not cheap.
 */
const timeFormatters = new Map<string, Intl.DateTimeFormat>()

function sydneyTimeFor(language: LanguageCode): Intl.DateTimeFormat {
  const locale = speechLocaleOf(language)
  let formatter = timeFormatters.get(locale)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, {
      timeZone: 'Australia/Sydney',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    timeFormatters.set(locale, formatter)
  }
  return formatter
}

/**
 * The official English text, shown verbatim beneath the translation.
 *
 * Every field the feed sent is emitted, in the order the feed sent it. The
 * previous implementation rebuilt this from a fixed list of seven keys, which
 * silently dropped the feed's `FIRE` field and would drop any field the RFS
 * adds in future. Preserving the official content means preserving all of it.
 */
function buildOfficialText(relevant: RelevantWarning): string {
  const w = relevant.warning
  const entries = Object.entries(w.fields)

  const lines =
    entries.length > 0
      ? entries.map(([key, value]) => `${key}: ${value}`)
      : // Fallback for warnings that did not come from the feed, such as the
        // demo scenario, which carries no parsed description.
        [
          `ALERT LEVEL: ${OFFICIAL_LEVEL[w.level] ?? w.level}`,
          w.location ? `LOCATION: ${w.location}` : null,
          w.council ? `COUNCIL AREA: ${w.council}` : null,
          w.status ? `STATUS: ${w.status}` : null,
          w.type ? `TYPE: ${w.type}` : null,
          w.sizeHa !== null ? `SIZE: ${w.sizeHa} ha` : null,
          w.agency ? `RESPONSIBLE AGENCY: ${w.agency}` : null,
        ].filter((line): line is string => line !== null)

  if (w.rawAdvice) lines.push('', w.rawAdvice)
  return lines.join('\n')
}

export function renderWarning(
  relevant: RelevantWarning,
  language: LanguageCode,
): RenderedWarning {
  const pack = getPack(language)
  const w = relevant.warning

  const statusText = pack.statusValues[w.status.trim().toLowerCase()] ?? w.status
  const typeText = pack.typeValues[w.type.trim().toLowerCase()] ?? w.type

  let distanceText: string | null = null
  if (relevant.inside) {
    distanceText = pack.ui.youAreInside
  } else if (relevant.distanceKm !== null) {
    distanceText = `${relevant.distanceKm.toFixed(1)} ${pack.ui.kmAway}`
  }

  const levelMeaning = pack.levelMeaning[w.level]
  const levelAction = pack.levelAction[w.level]

  return {
    levelName: pack.levelName[w.level],
    levelMeaning,
    levelAction,
    // Australian place names stay in English deliberately. A translated
    // street name cannot be matched to a road sign, read to a 000 operator,
    // or searched on a map. The UI labels it instead of translating it.
    placeText: w.location || w.title,
    councilText: w.council,
    statusText,
    typeText,
    sizeText: w.sizeHa !== null ? `${w.sizeHa} ha` : null,
    distanceText,
    updatedText: w.updatedAt ? sydneyTimeFor(language).format(w.updatedAt) : null,
    officialText: buildOfficialText(relevant),
    officialUrl: w.officialUrl,
    // Speaks the meaning and the action, never the jargon label.
    speechText: [levelMeaning, w.location, statusText, levelAction]
      .filter(Boolean)
      .join(' '),
    speechLocale: speechLocaleOf(language),
  }
}
