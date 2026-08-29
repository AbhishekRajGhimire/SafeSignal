import { getPack } from './index'
import type { LanguageCode } from '@/lib/domain/profile'
import type { ChangeDetail } from '@/lib/domain/changeSummary'

/**
 * Renders change details as sentences in the reader's language.
 *
 * Level names come from the pack's official labels and statuses from its
 * status vocabulary, so "Watch and Act" and "Out of control" read here
 * exactly as they read on the warning itself.
 */

const sydneyTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Australia/Sydney',
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? '')
}

export function renderChangeDetail(detail: ChangeDetail, language: LanguageCode): string {
  const pack = getPack(language)

  switch (detail.kind) {
    case 'level':
      return fill(pack.ui.changeLevel, {
        from: pack.levelName[detail.from],
        to: pack.levelName[detail.to],
      })
    case 'status':
      return fill(pack.ui.changeStatus, {
        from: pack.statusValues[detail.from.trim().toLowerCase()] ?? detail.from,
        to: pack.statusValues[detail.to.trim().toLowerCase()] ?? detail.to,
      })
    case 'size':
      return fill(pack.ui.changeSize, {
        from: `${detail.fromHa} ha`,
        to: `${detail.toHa} ha`,
      })
    case 'area':
      return pack.ui.changeArea
    case 'time':
      return fill(pack.ui.changeTime, { time: sydneyTime.format(detail.updatedAt) })
    case 'unspecified':
      return pack.ui.officialWarningUpdated
  }
}

/**
 * The lines shown under "What changed?".
 *
 * Confident descriptions come first. When something also changed that we
 * could not describe, the generic line follows them; when nothing at all
 * could be described, the generic line stands alone and the latest official
 * message below the summary carries the substance.
 */
export function renderChangeSummary(details: ChangeDetail[], language: LanguageCode): string[] {
  const pack = getPack(language)
  if (details.length === 0) return [pack.ui.officialWarningUpdated]

  const confident = details.filter((d) => d.kind !== 'unspecified')
  const lines = confident.map((d) => renderChangeDetail(d, language))
  if (confident.length < details.length) lines.push(pack.ui.officialWarningUpdated)
  return lines
}
