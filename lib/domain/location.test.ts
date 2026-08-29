import { describe, it, expect } from 'vitest'
import {
  GEO_PERMISSION_DENIED,
  GEO_POSITION_UNAVAILABLE,
  GEO_TIMEOUT,
  asLatLon,
  interpretGeolocationError,
  manualSelectionAvailable,
  mayRequestDeviceLocation,
  toSelectedLocation,
  type LocationPermission,
} from './location'

describe('interpretGeolocationError', () => {
  it('maps the three specified error codes', () => {
    expect(interpretGeolocationError({ code: GEO_PERMISSION_DENIED })).toBe('denied')
    expect(interpretGeolocationError({ code: GEO_POSITION_UNAVAILABLE })).toBe('unavailable')
    expect(interpretGeolocationError({ code: GEO_TIMEOUT })).toBe('timeout')
  })

  it('never reports an unrecognised failure as a refusal', () => {
    // Telling someone they denied permission when they did not is both wrong
    // and unrecoverable from inside the interface.
    expect(interpretGeolocationError({ code: 99 })).toBe('unavailable')
    expect(interpretGeolocationError({})).toBe('unavailable')
    expect(interpretGeolocationError(null)).toBe('unavailable')
  })
})

describe('permission gating', () => {
  it('starts in a state where nothing has been requested', () => {
    const initial: LocationPermission = 'not-requested'
    expect(mayRequestDeviceLocation(initial)).toBe(true)
  })

  it('stops asking once the user has refused', () => {
    expect(mayRequestDeviceLocation('denied')).toBe(false)
  })

  it('stops asking when the browser has no geolocation at all', () => {
    expect(mayRequestDeviceLocation('unsupported')).toBe(false)
  })

  it('allows a retry after a technical failure, which is not a refusal', () => {
    expect(mayRequestDeviceLocation('unavailable')).toBe(true)
    expect(mayRequestDeviceLocation('timeout')).toBe(true)
  })

  it('does not re-ask while a request is in flight or already granted', () => {
    expect(mayRequestDeviceLocation('requesting')).toBe(false)
    expect(mayRequestDeviceLocation('granted')).toBe(false)
  })

  it('keeps manual selection available in every permission state', () => {
    expect(manualSelectionAvailable()).toBe(true)
  })
})

describe('selected locations', () => {
  it('accepts a valid device position', () => {
    expect(toSelectedLocation({ lat: -33.7, lon: 150.3 }, 'Your location', 'device'))
      .toEqual({ lat: -33.7, lon: 150.3, label: 'Your location', source: 'device' })
  })

  it('accepts a manually chosen town', () => {
    const chosen = toSelectedLocation({ lat: -33.7128, lon: 150.3119 }, 'Katoomba', 'manual')
    expect(chosen?.source).toBe('manual')
  })

  it('rejects an impossible coordinate rather than storing it', () => {
    expect(toSelectedLocation({ lat: 999, lon: 0 }, 'nowhere', 'manual')).toBeNull()
    expect(toSelectedLocation({ lat: NaN, lon: 0 }, 'nowhere', 'device')).toBeNull()
  })

  it('converts to a bare coordinate, or null when there is none', () => {
    expect(asLatLon({ lat: -33.7, lon: 150.3 })).toEqual({ lat: -33.7, lon: 150.3 })
    expect(asLatLon(null)).toBeNull()
    expect(asLatLon({ lat: 999, lon: 0 })).toBeNull()
  })
})
