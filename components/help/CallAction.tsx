'use client'

import { packLanguage } from '@/lib/domain/profile'
import { useProfile, usePack } from '../ProfileProvider'
import type { OfficialService } from '@/lib/help/services'

/**
 * The one call to make first.
 *
 * Leading with six numbers makes someone in danger read a list. Leading
 * with one makes them act. The rest stay one tap away.
 *
 * The service name is always English, because that is what the operator
 * answers with, and it is marked lang="en" so a screen reader set to
 * another language does not mangle it.
 */
export function CallAction({ service }: { service: OfficialService }) {
  const { profile } = useProfile()
  const pack = usePack()

  return (
    <section className="call">
      <p className="call__eyebrow">{pack.ui.callNow}</p>
      <h2 className="call__name" lang="en" dir="ltr">{service.name}</h2>
      <p className="call__why">{service.descriptions[packLanguage(profile.language)]}</p>
      <a className="button call__button" href={`tel:${service.phone}`}>
        <span className="call__icon" aria-hidden="true">✆</span>
        <span className="call__number">{service.phoneDisplay}</span>
      </a>
    </section>
  )
}
