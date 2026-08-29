import type { Warning } from '@/lib/domain/warning'

/**
 * Duplicate detection.
 *
 * The RFS guid is a stable per-incident permalink and has been unique in
 * every snapshot observed. That is an observation, not a guarantee: a feed
 * assembled from several regional sources can repeat an incident, and two
 * cards for one fire would read as two fires.
 *
 * When an id repeats, the most recently updated record wins. A record with no
 * timestamp never displaces one that has one.
 */

export interface DedupeResult {
  warnings: Warning[]
  duplicates: number
}

function isNewer(candidate: Warning, incumbent: Warning): boolean {
  const a = candidate.updatedAt?.getTime()
  const b = incumbent.updatedAt?.getTime()
  if (a === undefined) return false
  if (b === undefined) return true
  return a > b
}

export function dedupeWarnings(warnings: Warning[]): DedupeResult {
  const byId = new Map<string, Warning>()
  const order: string[] = []
  let duplicates = 0

  for (const warning of warnings) {
    const incumbent = byId.get(warning.id)
    if (!incumbent) {
      byId.set(warning.id, warning)
      order.push(warning.id)
      continue
    }
    duplicates += 1
    if (isNewer(warning, incumbent)) byId.set(warning.id, warning)
  }

  // Feed order is preserved: the RFS orders by significance, and reordering
  // would silently change what a user sees first.
  return { warnings: order.map((id) => byId.get(id)!), duplicates }
}
