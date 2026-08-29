import type { AlertLevel } from '@/lib/domain/warning'

/** A distinct shape per level, so colour is never the only signal. */
const SHAPE: Record<AlertLevel, string> = {
  'emergency-warning': '▲',
  'watch-and-act': '◆',
  advice: '●',
  'planned-burn': '■',
  'not-applicable': '□',
}

export function AlertBadge({ level, label }: { level: AlertLevel; label: string }) {
  return (
    <span
      className="badge"
      style={{
        background: `var(--level-${level})`,
        color: `var(--level-${level}-ink)`,
      }}
    >
      <span className="badge__shape" aria-hidden="true">{SHAPE[level]}</span>
      <span>{label}</span>
    </span>
  )
}
