import { hasNeed, type UserProfile } from '@/lib/domain/profile'
import type { RelevantWarning } from '@/lib/domain/match'

const LEVEL_LABEL: Record<string, string> = {
  'emergency-warning': 'Emergency Warning',
  'watch-and-act': 'Watch and Act',
  advice: 'Advice',
  'planned-burn': 'Planned Burn',
  'not-applicable': 'incident',
}

/** Only the facts a neighbour needs in order to help. Nothing more. */
const NEED_LINE: Partial<Record<string, string>> = {
  mobility: 'I need help to move around.',
  'low-vision': 'I have low vision.',
  hearing: 'I have difficulty hearing.',
}

const TRANSPORT_LINE: Partial<Record<UserProfile['transport'], string>> = {
  'public-transport': 'I do not have a car.',
  'taxi-rideshare': 'I do not have a car.',
  'accessible-transport': 'I need accessible transport.',
  'needs-assistance': 'I need someone to help me leave.',
  unsure: 'I am not sure how I would leave.',
}

/**
 * Written in English: the recipient is a neighbour, family member, or
 * emergency contact in Australia.
 */
export function buildShareMessage(
  profile: UserProfile,
  relevant: RelevantWarning | null,
): string {
  const place = profile.location?.label ?? 'New South Wales'
  const lines: string[] = [`I am at ${place}.`]

  if (relevant) {
    const level = LEVEL_LABEL[relevant.warning.level] ?? relevant.warning.level
    const where = relevant.warning.location || relevant.warning.title
    lines.push(`There is a bush fire ${level} for ${where}.`)
    if (relevant.inside) lines.push('I am inside the fire area.')
    else if (relevant.distanceKm !== null) {
      lines.push(`It is about ${relevant.distanceKm.toFixed(1)} km from me.`)
    }
  }

  for (const need of ['mobility', 'low-vision', 'hearing'] as const) {
    const line = hasNeed(profile, need) ? NEED_LINE[need] : undefined
    if (line) lines.push(line)
  }

  const transport = TRANSPORT_LINE[profile.transport]
  if (transport) lines.push(transport)

  lines.push('Sent from SafeSignal.')
  return lines.join('\n')
}

export async function shareSituation(
  message: string,
): Promise<'shared' | 'copied' | 'unsupported'> {
  const nav = typeof navigator === 'undefined' ? undefined : navigator

  if (nav?.share) {
    try {
      await nav.share({ text: message })
      return 'shared'
    } catch {
      // Includes the user dismissing the share sheet, which is not an error.
      return 'unsupported'
    }
  }

  if (nav?.clipboard?.writeText) {
    try {
      await nav.clipboard.writeText(message)
      return 'copied'
    } catch {
      return 'unsupported'
    }
  }

  return 'unsupported'
}
