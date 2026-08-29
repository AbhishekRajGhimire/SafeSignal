'use client'

import { packLanguage } from '@/lib/domain/profile'
import { useProfile, usePack } from '../ProfileProvider'
import type { OfficialService } from '@/lib/help/services'

/**
 * A secondary service. A row in a list, not a card in a deck: these are
 * alternatives to scan, and boxing each one would make six equal choices
 * out of what is really one choice and five fallbacks.
 */
export function ServiceRow({ service }: { service: OfficialService }) {
  const { profile } = useProfile()
  const pack = usePack()

  return (
    <a className="service" href={`tel:${service.phone}`}>
      <span className="service__text">
        <span className="service__name" lang="en" dir="ltr">{service.name}</span>
        <span className="service__why">
          {service.descriptions[packLanguage(profile.language)]}
        </span>
      </span>
      <span className="service__number">
        <span className="service__icon" aria-hidden="true">✆</span>
        {service.phoneDisplay}
        <span className="visually-hidden"> {pack.ui.callNow}</span>
      </span>
    </a>
  )
}
