const SYDNEY = 'Australia/Sydney'

const formatter = new Intl.DateTimeFormat('en-US', {
  timeZone: SYDNEY,
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

/**
 * Minutes that Sydney is ahead of UTC at the given instant (+600 or +660).
 * Formats the instant as Sydney wall time, reads it back as if it were UTC,
 * and measures the gap.
 */
function sydneyOffsetMinutes(instant: Date): number {
  const parts: Record<string, string> = {}
  for (const part of formatter.formatToParts(instant)) {
    if (part.type !== 'literal') parts[part.type] = part.value
  }
  const asIfUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  )
  return (asIfUtc - instant.getTime()) / 60_000
}

/**
 * Builds the UTC instant for a Sydney wall-clock reading.
 * `month` is 1-based. Resolves the offset twice so that readings near a
 * daylight-saving boundary settle on the correct side of the transition.
 */
export function fromSydneyWallTime(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute, second)
  let offset = sydneyOffsetMinutes(new Date(naive))
  let instant = naive - offset * 60_000
  const settled = sydneyOffsetMinutes(new Date(instant))
  if (settled !== offset) {
    offset = settled
    instant = naive - offset * 60_000
  }
  return new Date(instant)
}
