import { SEVERITY, type AlertLevel, type PolygonRing, type Warning } from './warning'

/**
 * Warning lifecycle.
 *
 * The feed is a snapshot, not an event stream: it says what is current, never
 * what changed. Everything downstream that needs to react to a change (a
 * screen-reader announcement, re-speaking a warning, an escalation
 * transition) needs those changes named explicitly, so they are derived here
 * by comparing consecutive snapshots.
 *
 * A warning leaving the feed is reported rather than allowed to vanish
 * silently. Someone told a fire was near them deserves to be told it is no
 * longer listed.
 */

export type WarningChange =
  | { kind: 'new'; id: string; level: AlertLevel }
  | { kind: 'level-changed'; id: string; from: AlertLevel; to: AlertLevel; escalated: boolean }
  | { kind: 'area-changed'; id: string }
  | { kind: 'updated'; id: string; fields: string[] }
  | { kind: 'cancelled'; id: string; lastLevel: AlertLevel }

/** Fields whose change is worth reporting. Timestamps alone are not. */
const TRACKED_FIELDS = ['status', 'type', 'location', 'council', 'sizeHa', 'agency'] as const

function ringsEqual(a: PolygonRing, b: PolygonRing): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (a[i].lat !== b[i].lat || a[i].lon !== b[i].lon) return false
  }
  return true
}

/** Geometry comparison is order-sensitive on purpose: the feed is stable. */
export function areaChanged(before: Warning, after: Warning): boolean {
  if (before.polygons.length !== after.polygons.length) return true
  for (let i = 0; i < before.polygons.length; i += 1) {
    if (!ringsEqual(before.polygons[i], after.polygons[i])) return true
  }
  const p = before.point
  const q = after.point
  if ((p === null) !== (q === null)) return true
  if (p && q && (p.lat !== q.lat || p.lon !== q.lon)) return true
  return false
}

export function changedFields(before: Warning, after: Warning): string[] {
  const changed: string[] = []
  for (const field of TRACKED_FIELDS) {
    if (before[field] !== after[field]) changed.push(field)
  }
  return changed
}

/**
 * Compares two snapshots and names every change.
 *
 * A single warning can produce more than one change: a fire that both
 * escalates and grows reports `level-changed` and `area-changed`, because a
 * consumer may care about either independently.
 */
export function diffWarnings(previous: Warning[], next: Warning[]): WarningChange[] {
  const before = new Map(previous.map((w) => [w.id, w]))
  const after = new Map(next.map((w) => [w.id, w]))
  const changes: WarningChange[] = []

  for (const warning of next) {
    const prior = before.get(warning.id)

    if (!prior) {
      changes.push({ kind: 'new', id: warning.id, level: warning.level })
      continue
    }

    if (prior.level !== warning.level) {
      changes.push({
        kind: 'level-changed',
        id: warning.id,
        from: prior.level,
        to: warning.level,
        escalated: SEVERITY[warning.level] > SEVERITY[prior.level],
      })
    }

    if (areaChanged(prior, warning)) {
      changes.push({ kind: 'area-changed', id: warning.id })
    }

    const fields = changedFields(prior, warning)
    if (fields.length > 0) {
      changes.push({ kind: 'updated', id: warning.id, fields })
    }
  }

  for (const warning of previous) {
    if (!after.has(warning.id)) {
      changes.push({ kind: 'cancelled', id: warning.id, lastLevel: warning.level })
    }
  }

  return changes
}

/** The subset a person must be told about, as opposed to merely logged. */
export function isAnnounceable(change: WarningChange): boolean {
  if (change.kind === 'new') return true
  if (change.kind === 'cancelled') return true
  if (change.kind === 'level-changed') return true
  return false
}

export function escalations(changes: WarningChange[]): WarningChange[] {
  return changes.filter((c) => c.kind === 'level-changed' && c.escalated)
}
