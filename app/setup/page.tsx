'use client'

import { useRouter } from 'next/navigation'
import { useProfile, usePack } from '@/components/ProfileProvider'
import { ChoiceList } from '@/components/ChoiceList'
import { PlacePicker } from '@/components/PlacePicker'
import { LANGUAGE_NAMES } from '@/lib/i18n'
import { LANGUAGE_CODES, type Mobility, type Transport } from '@/lib/domain/profile'

export default function SetupPage() {
  const router = useRouter()
  const { profile, update, ready } = useProfile()
  const pack = usePack()

  if (!ready) return <main><p>...</p></main>

  const mobility: { value: Mobility; label: string }[] = [
    { value: 'none', label: pack.ui.mobilityNone },
    { value: 'limited-walking', label: pack.ui.mobilityLimited },
    { value: 'wheelchair', label: pack.ui.mobilityWheelchair },
    { value: 'bedbound', label: pack.ui.mobilityBedbound },
  ]

  const transport: { value: Transport; label: string }[] = [
    { value: 'own-car', label: pack.ui.transportOwnCar },
    { value: 'can-get-lift', label: pack.ui.transportLift },
    { value: 'no-transport', label: pack.ui.transportNone },
  ]

  return (
    <main>
      <h1>{pack.ui.setupTitle}</h1>
      <p>{pack.ui.setupIntro}</p>

      <section className="card">
        <ChoiceList
          legend={pack.ui.chooseLanguage}
          choices={LANGUAGE_CODES.map((code) => ({ value: code, label: LANGUAGE_NAMES[code] }))}
          selected={profile.language}
          onSelect={(language) => update({ language })}
        />
      </section>

      <section className="card">
        <h2>{pack.ui.whereYouLive}</h2>
        <PlacePicker selected={profile.location} onSelect={(location) => update({ location })} />
      </section>

      <section className="card">
        <ChoiceList
          legend={pack.ui.mobilityQuestion}
          choices={mobility}
          selected={profile.mobility}
          onSelect={(value) => update({ mobility: value })}
        />
      </section>

      <section className="card">
        <ChoiceList
          legend={pack.ui.transportQuestion}
          choices={transport}
          selected={profile.transport}
          onSelect={(value) => update({ transport: value })}
        />
      </section>

      <section className="card stack">
        <label className="choice">
          <input
            type="checkbox"
            checked={profile.largeText}
            onChange={(event) => update({ largeText: event.target.checked })}
          />
          <span>{pack.ui.largeTextLabel}</span>
        </label>
        <label className="choice">
          <input
            type="checkbox"
            checked={profile.audio}
            onChange={(event) => update({ audio: event.target.checked })}
          />
          <span>{pack.ui.audioLabel}</span>
        </label>
      </section>

      <button
        type="button"
        className="button"
        onClick={() => {
          update({ completedSetup: true })
          router.push('/')
        }}
      >
        {pack.ui.saveAndContinue}
      </button>
    </main>
  )
}
