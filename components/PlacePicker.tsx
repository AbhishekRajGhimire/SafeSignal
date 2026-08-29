'use client'

import { useState } from 'react'
import { searchPlaces, type NswPlace } from '@/lib/locations/nsw'
import { usePack } from './ProfileProvider'

export function PlacePicker({
  selected,
  onSelect,
}: {
  selected: { label: string } | null
  onSelect: (place: { lat: number; lon: number; label: string }) => void
}) {
  const pack = usePack()
  const [query, setQuery] = useState('')
  const [geoDenied, setGeoDenied] = useState(false)
  const results = searchPlaces(query)

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setGeoDenied(true)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        onSelect({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          label: 'My location',
        })
      },
      // A denied prompt is expected, not exceptional. The search box below is
      // already visible, so there is nothing to recover.
      () => setGeoDenied(true),
    )
  }

  return (
    <div>
      <button type="button" className="button button--secondary" onClick={useMyLocation}>
        {pack.ui.useMyLocation}
      </button>

      <label className="field" style={{ marginTop: 'var(--space-3)' }}>
        <span>{pack.ui.searchPlace}</span>
        <input
          className="control"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          autoComplete="off"
        />
      </label>

      {results.map((place: NswPlace) => (
        <button
          key={place.label}
          type="button"
          className={`choice${selected?.label === place.label ? ' choice--selected' : ''}`}
          style={{ width: '100%', textAlign: 'left' }}
          onClick={() => onSelect({ lat: place.lat, lon: place.lon, label: place.label })}
        >
          {place.label} {place.postcode}
        </button>
      ))}

      {selected && <p className="muted">{selected.label}</p>}
      {geoDenied && <p className="muted">{pack.ui.searchPlace}</p>}
    </div>
  )
}
