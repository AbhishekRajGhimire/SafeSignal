import { fromSydneyWallTime } from './time'

const BREAK = /<br\s*\/?>/gi

/**
 * The RFS `description` field is a run of `KEY: value` pairs joined by
 * literal break tags. Unknown keys are kept rather than rejected, because
 * the RFS can add fields without notice.
 */
export function parseDescription(description: string): Record<string, string> {
  const fields: Record<string, string> = {}
  if (!description) return fields

  for (const segment of description.split(BREAK)) {
    const colon = segment.indexOf(':')
    if (colon === -1) continue
    const key = segment.slice(0, colon).trim().toUpperCase()
    const value = segment.slice(colon + 1).trim()
    if (key) fields[key] = value
  }
  return fields
}

const PUB_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)$/i

/** Parses `29/08/2026 4:12:00 AM`. Day first, Sydney local time. */
export function parsePubDate(value: string | undefined): Date | null {
  if (!value) return null
  const m = PUB_DATE.exec(value.trim())
  if (!m) return null

  const [, day, month, year, rawHour, minute, second, meridiem] = m
  let hour = Number(rawHour)
  if (hour < 1 || hour > 12) return null
  if (meridiem.toUpperCase() === 'PM' && hour !== 12) hour += 12
  if (meridiem.toUpperCase() === 'AM' && hour === 12) hour = 0

  return buildIfValid(Number(year), Number(month), Number(day), hour, Number(minute), Number(second))
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

const UPDATED = /^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})\s+(\d{1,2}):(\d{2})$/

/** Parses `29 Aug 2026 14:12`. 24-hour, Sydney local time. */
export function parseUpdated(value: string | undefined): Date | null {
  if (!value) return null
  const m = UPDATED.exec(value.trim())
  if (!m) return null

  const [, day, monthName, year, hour, minute] = m
  const month = MONTHS[monthName.slice(0, 3).toLowerCase()]
  if (!month) return null

  return buildIfValid(Number(year), month, Number(day), Number(hour), Number(minute), 0)
}

function buildIfValid(
  year: number, month: number, day: number,
  hour: number, minute: number, second: number,
): Date | null {
  if (month < 1 || month > 12) return null
  if (day < 1 || day > 31) return null
  if (hour > 23 || minute > 59 || second > 59) return null
  const date = fromSydneyWallTime(year, month, day, hour, minute, second)
  return Number.isNaN(date.getTime()) ? null : date
}

/** Parses `0 ha`, `1,234 ha`, `12.5 ha`. */
export function parseSizeHa(value: string | undefined): number | null {
  if (!value) return null
  const m = /(\d[\d,]*(?:\.\d+)?)/.exec(value)
  if (!m) return null
  const size = Number(m[1].replace(/,/g, ''))
  return Number.isFinite(size) ? size : null
}
