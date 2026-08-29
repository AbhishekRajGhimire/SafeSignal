import type { LatLon, Warning, WarningProvenance } from '@/lib/domain/warning'
import { FEED_SOURCE } from '@/lib/rfs/normalize'

export interface ScenarioStep {
  atMs: number
  label: string
  warnings: Warning[]
}

/** Roughly one kilometre of latitude. */
const KM_IN_DEGREES = 0.009

const BASE = new Date('2026-11-14T03:00:00.000Z')

/**
 * Demo warnings are simulated and say so in their provenance, so nothing
 * downstream can mistake them for issued RFS content.
 */
const DEMO_PROVENANCE: WarningProvenance = {
  ...FEED_SOURCE,
  sourceName: 'SIMULATED — not issued by the NSW Rural Fire Service',
  copyright: 'Simulated data for demonstration only',
  retrievedAt: BASE,
  feedLastModified: null,
  transform: 'normalized',
}

/**
 * A ring roughly one kilometre across, centred on the anchor, so demo mode
 * exercises the real polygon-containment path rather than skipping it.
 */
function ringAround(centre: LatLon, halfKm: number) {
  const d = halfKm * KM_IN_DEGREES
  return [
    { lat: centre.lat - d, lon: centre.lon - d },
    { lat: centre.lat - d, lon: centre.lon + d },
    { lat: centre.lat + d, lon: centre.lon + d },
    { lat: centre.lat + d, lon: centre.lon - d },
    { lat: centre.lat - d, lon: centre.lon - d },
  ]
}
const minutesAfter = (minutes: number) => new Date(BASE.getTime() + minutes * 60_000)

function demoWarning(
  anchor: LatLon,
  anchorLabel: string,
  distanceKm: number,
  fields: Pick<Warning, 'level' | 'status' | 'sizeHa' | 'rawAdvice'>,
  minute: number,
  polygons: Warning['polygons'] = [],
): Warning {
  return {
    id: 'safesignal-demo-incident',
    title: `GREEN GULLY TRAIL, ${anchorLabel.toUpperCase()}`,
    location: `Green Gully Trail, ${anchorLabel}`,
    council: 'Blue Mountains',
    type: 'Bush Fire',
    agency: 'Rural Fire Service',
    updatedAt: minutesAfter(minute),
    publishedAt: BASE,
    point: { lat: anchor.lat + distanceKm * KM_IN_DEGREES, lon: anchor.lon },
    polygons,
    officialUrl: 'https://www.rfs.nsw.gov.au/fire-information/fires-near-me',
    fields: {},
    raw: { properties: { simulated: true }, geometry: null },
    provenance: DEMO_PROVENANCE,
    ...fields,
  }
}

/**
 * A simulated escalation for demonstration. The wording follows the shape of
 * RFS advice, but the fire is not real, which is why demo mode always renders
 * a simulated-data banner.
 */
export function buildScenario(anchor: LatLon, anchorLabel: string): ScenarioStep[] {
  return [
    {
      atMs: 0,
      label: 'Advice',
      warnings: [
        demoWarning(anchor, anchorLabel, 8, {
          level: 'advice',
          status: 'Being controlled',
          sizeHa: 12,
          rawAdvice:
            'A fire is burning in the area. There is no immediate danger. ' +
            'Stay up to date in case the situation changes.',
        }, 0),
      ],
    },
    {
      atMs: 15_000,
      label: 'Watch and Act',
      warnings: [
        demoWarning(anchor, anchorLabel, 5, {
          level: 'watch-and-act',
          status: 'Out of control',
          sizeHa: 180,
          rawAdvice:
            'Conditions are changing and the fire is moving towards the area. ' +
            'You need to start taking action now to protect yourself and your family.',
        }, 22),
      ],
    },
    {
      atMs: 35_000,
      label: 'Emergency Warning',
      warnings: [
        demoWarning(anchor, anchorLabel, 2, {
          level: 'emergency-warning',
          status: 'Out of control',
          sizeHa: 840,
          rawAdvice:
            'You are in danger and need to act immediately to survive. ' +
            'The fire is approaching and conditions are dangerous. ' +
            'If you are not prepared, leave now towards the east.',
        }, 41, [ringAround(anchor, 3)]),
      ],
    },
  ]
}
