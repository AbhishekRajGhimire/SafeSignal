'use client'

import { usePack, useProfile } from './ProfileProvider'
import { buildChecklist } from '@/lib/help/checklist'
import type { Warning } from '@/lib/domain/warning'

/**
 * What to do now.
 *
 * Every line carries where its wording came from. A sentence the RFS wrote
 * is marked as theirs and kept in English; a sentence SafeSignal wrote is
 * marked as ours. Nothing here is presented as official unless it is.
 */
export function Checklist({ warning }: { warning: Warning | null }) {
  const { profile } = useProfile()
  const pack = usePack()
  const items = buildChecklist(warning, profile.language)

  if (items.length === 0) return null

  return (
    <ol className="checklist">
      {items.map((item, index) => (
        <li key={index} className="checklist__item">
          <span className="checklist__mark" aria-hidden="true">{index + 1}</span>
          <span className="checklist__body">
            {/* Official sentences stay English and are isolated, so a
                trailing full stop does not jump to the front of the line
                on a right-to-left page. */}
            {item.source === 'nsw-rfs' ? (
              <span lang="en" dir="ltr" className="ltr">{item.text}</span>
            ) : (
              <span>{item.text}</span>
            )}
            <span className="checklist__source">
              {item.source === 'nsw-rfs' ? pack.ui.sourceRfs : 'SafeSignal'}
            </span>
          </span>
        </li>
      ))}
    </ol>
  )
}
