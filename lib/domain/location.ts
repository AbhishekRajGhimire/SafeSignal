import { isValidLatLon } from './geo'
import type { LatLon } from './warning'

/**
 * Location acquisition.
 *
 * Device location is only ever requested in response to a deliberate user
 * action, never on page load. A manually chosen town is a first-class
 * alternative, not a fallback for failure: it is what makes the app usable
 * with location services switched off, and what makes the demo reproducible.
 */

export type LocationPermission =
  /** Never asked. The state the app starts in and stays in until asked. */
  | 'not-requested'
  | 'requesting'
  | 'granted'
  | 'denied'
  /** The browser has no geolocation at all. */
  | 'unsupported'
  /** The device tried and could not get a fix. */
  | 'unavailable'
  | 'timeout'

export type LocationSource = 'device' | 'manual'

export interface SelectedLocation {
  lat: number
  lon: number
  label: string
  source: LocationSource
}

/** Geolocation error codes, per the W3C spec. */
export const GEO_PERMISSION_DENIED = 1
export const GEO_POSITION_UNAVAILABLE = 2
export const GEO_TIMEOUT = 3

export function interpretGeolocationError(error: { code?: number } | null): LocationPermission {
  switch (error?.code) {
    case GEO_PERMISSION_DENIED:
      return 'denied'
    case GEO_POSITION_UNAVAILABLE:
      return 'unavailable'
    case GEO_TIMEOUT:
      return 'timeout'
    default:
      // An unrecognised failure is reported as unavailable rather than as a
      // refusal: we must not tell someone they denied permission when they
      // did not.
      return 'unavailable'
  }
}

/**
 * True when the interface should offer to ask for device location.
 *
 * Once refused, we stop asking. Repeatedly prompting someone who has said no
 * is hostile, and the manual search reaches the same result.
 */
export function mayRequestDeviceLocation(permission: LocationPermission): boolean {
  return permission === 'not-requested' || permission === 'unavailable' || permission === 'timeout'
}

/** Manual selection always remains available, whatever the permission state. */
export function manualSelectionAvailable(): boolean {
  return true
}

export function toSelectedLocation(
  point: { lat: number; lon: number },
  label: string,
  source: LocationSource,
): SelectedLocation | null {
  if (!isValidLatLon(point)) return null
  return { lat: point.lat, lon: point.lon, label, source }
}

export function asLatLon(location: { lat: number; lon: number } | null): LatLon | null {
  if (!location || !isValidLatLon(location)) return null
  return { lat: location.lat, lon: location.lon }
}
