'use client'

import { packLanguage } from '@/lib/domain/profile'
import { useProfile, usePack } from './ProfileProvider'
import type { OfficialService } from '@/lib/help/services'

export function ServiceCard({ service }: { service: OfficialService }) {
  const { profile } = useProfile()
  const pack = usePack()

  return (
    <article className="card stack">
      <h3 lang="en">{service.name}</h3>
      <p>{service.descriptions[packLanguage(profile.language)]}</p>
      <a className="button" href={`tel:${service.phone}`}>
        {pack.ui.callNow} {service.phoneDisplay}
      </a>
    </article>
  )
}
