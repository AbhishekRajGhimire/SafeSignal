'use client'

import { usePack, useProfile } from './ProfileProvider'
import { buildChecklist } from '@/lib/help/checklist'
import type { Warning } from '@/lib/domain/warning'

export function Checklist({ warning }: { warning: Warning | null }) {
  const { profile } = useProfile()
  const pack = usePack()
  const items = buildChecklist(warning, profile.language)

  if (items.length === 0) return null

  return (
    <section className="card stack">
      <ul style={{ paddingLeft: 'var(--space-3)' }}>
        {items.map((item, index) => (
          <li key={index} style={{ marginBottom: 'var(--space-2)' }}>
            <span lang={item.source === 'nsw-rfs' ? 'en' : undefined}>{item.text}</span>
            {/* Every official sentence carries its source on screen. */}
            {item.source === 'nsw-rfs' && (
              <span className="muted"> ({pack.ui.sourceRfs})</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
