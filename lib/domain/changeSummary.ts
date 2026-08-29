import { areaChanged, changedFields } from './lifecycle'
import { SEVERITY, type AlertLevel, type Warning } from './warning'

/**
 * Describes what changed between two versions of the same official warning.
 *
 * Only changes that can be reliably derived from the official data are ever
 * named: the level, the status, the size, the mapped area, and the official
 * update time. Anything else that differs — or a value we hold on only one
 * side — becomes `unspecified`, which the interface renders as
 * "Official warning updated." with the latest official message beneath it.
 *
 * Nothing here infers an instruction. A description says what the feed says
 * changed; it never says what to do about it. What to do comes from the
 * level action and the official advice, exactly as before the change.
 */

export type ChangeDetail =
  | { kind: 'level'; from: AlertLevel; to: AlertLevel; escalated: boolean }
  | { kind: 'status'; from: string; to: string }
  | { kind: 'size'; fromHa: number; toHa: number }
  | { kind: 'area' }
  | { kind: 'time'; updatedAt: Date }
  /** Something changed that we cannot confidently describe. */
  | { kind: 'unspecified' }

/** Fields the summary can state with before and after values. */
const DESCRIBABLE = new Set(['status', 'sizeHa'])

export function summariseWarningChange(
  before: Warning | null | undefined,
  after: Warning,
): ChangeDetail[] {
  // A warning with no predecessor is new, not changed. There is nothing to
  // compare, so there is nothing to claim.
  if (!before) return []

  const details: ChangeDetail[] = []

  if (before.level !== after.level) {
    details.push({
      kind: 'level',
      from: before.level,
      to: after.level,
      escalated: SEVERITY[after.level] > SEVERITY[before.level],
    })
  }

  const statusChanged = before.status !== after.status
  if (statusChanged && before.status && after.status) {
    details.push({ kind: 'status', from: before.status, to: after.status })
  }

  const sizeChanged = before.sizeHa !== after.sizeHa
  if (sizeChanged && before.sizeHa !== null && after.sizeHa !== null) {
    details.push({ kind: 'size', fromHa: before.sizeHa, toHa: after.sizeHa })
  }

  // The area is reported as changed, never as grown, shrunk, or moving in a
  // direction. Deriving movement from two polygons is an inference the
  // official data does not support, and "moving towards you" is exactly the
  // kind of claim this application must never invent.
  if (areaChanged(before, after)) {
    details.push({ kind: 'area' })
  }

  // Anything else the feed changed, or a describable field we only hold on
  // one side, is real but not confidently describable.
  const other = changedFields(before, after).filter((f) => !DESCRIBABLE.has(f))
  const statusUndescribable = statusChanged && !(before.status && after.status)
  const sizeUndescribable =
    sizeChanged && (before.sizeHa === null || after.sizeHa === null)

  if (other.length > 0 || statusUndescribable || sizeUndescribable) {
    details.push({ kind: 'unspecified' })
  }

  // A refreshed official timestamp with nothing else to show is still worth
  // stating: the authority looked at this warning again.
  if (details.length === 0 && after.updatedAt) {
    const beforeTime = before.updatedAt?.getTime()
    if (beforeTime !== after.updatedAt.getTime()) {
      details.push({ kind: 'time', updatedAt: after.updatedAt })
    }
  }

  return details
}

/** True when at least one change can be stated in concrete terms. */
export function hasConfidentDescription(details: ChangeDetail[]): boolean {
  return details.some((d) => d.kind !== 'unspecified')
}
