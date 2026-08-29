'use client'

import { useId, useState } from 'react'
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
  const [locating, setLocating] = useState(false)
  const results = searchPlaces(query)
  const statusId = useId()

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setGeoDenied(true)
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false)
        setGeoDenied(false)
        onSelect({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          label: pack.ui.locationChosen,
        })
      },
      // A denied prompt is expected, not exceptional. The search box below is
      // already visible, so there is nothing to recover.
      () => {
        setLocating(false)
        setGeoDenied(true)
      },
    )
  }

  return (
    <div>
      <button
        type="button"
        className="button button--secondary"
        onClick={useMyLocation}
        disabled={locating}
      >
        {pack.ui.useMyLocation}
      </button>

      {/* Previously this rendered the search-box label as if it were an error. */}
      {geoDenied && (
        <p className="notice" role="alert" style={{ marginTop: 'var(--space-3)' }}>
          {pack.ui.locationDenied}
        </p>
      )}

      <label className="field" style={{ marginTop: 'var(--space-3)' }}>
        <span>{pack.ui.searchPlace}</span>
        <input
          className="control"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          autoComplete="off"
          aria-describedby={statusId}
        />
      </label>

      {/* Announces how many places matched, so a screen-reader user is not
          left guessing whether typing produced anything. */}
      <p id={statusId} role="status" className="muted">
        {query.trim()
          ? results.length > 0
            ? `${results.length} ${pack.ui.placesFound}`
            : pack.ui.noPlacesFound
          : ''}
      </p>

      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {results.map((place: NswPlace) => {
          const isSelected = selected?.label === place.label
          return (
            <li key={place.label}>
              <button
                type="button"
                className={`option${isSelected ? ' option--selected' : ''}`}
                aria-pressed={isSelected}
                onClick={() => onSelect({ lat: place.lat, lon: place.lon, label: place.label })}
              >
                <span className="option__mark option__mark--single" aria-hidden="true">
                  {isSelected ? '✓' : ''}
                </span>
                <span className="option__label">
                  {place.label} {place.postcode}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      {selected && (
        <p style={{ fontWeight: 600 }}>
          {pack.ui.locationChosen}: {selected.label}
        </p>
      )}
    </div>
  )
}
