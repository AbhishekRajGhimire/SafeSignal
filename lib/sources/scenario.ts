import type { LatLon, Warning, WarningProvenance } from '@/lib/domain/warning'
import type { Freshness } from '@/lib/domain/freshness'
import type { FeedFailure } from '@/lib/rfs/fetch'
import type { UserProfile } from '@/lib/domain/profile'
import { FEED_SOURCE } from '@/lib/rfs/normalize'

export interface ScenarioStep {
  atMs: number
  label: string
  warnings: Warning[]
  /** Lets a scenario simulate the feed itself degrading, not just its content. */
  feedState?: {
    stale?: boolean
    freshness?: Freshness
    failure?: FeedFailure | null
  }
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
  id = 'safesignal-demo-incident',
): Warning {
  return {
    id,
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
        }, 0, [ringAround({ lat: anchor.lat + 8 * KM_IN_DEGREES, lon: anchor.lon }, 1.5)]),
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
        }, 22, [ringAround({ lat: anchor.lat + 5 * KM_IN_DEGREES, lon: anchor.lon }, 3)]),
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
    {
      // The level holds while the fire grows. This step exists so the demo
      // can show the difference between a warning being updated and a
      // warning escalating: the diff engine reports one and not the other.
      atMs: 55_000,
      label: 'Updated, same level',
      warnings: [
        demoWarning(anchor, anchorLabel, 2, {
          level: 'emergency-warning',
          status: 'Out of control',
          sizeHa: 1_450,
          rawAdvice:
            'You are in danger and need to act immediately to survive. ' +
            'The fire has grown and conditions remain dangerous. ' +
            'If you are not prepared, leave now towards the east.',
        }, 58, [ringAround(anchor, 5)]),
      ],
    },
  ]
}

/* ------------------------------------------------------------------ *
 * The six rehearsable scenarios
 *
 * Every warning in every scenario goes through demoWarning(), so every one
 * carries the SIMULATED provenance and a safesignal-demo id. Demo data and
 * live data can never mix: the WarningSource seam means the application is
 * subscribed to exactly one of DemoSource or LiveSource at a time.
 * ------------------------------------------------------------------ */

export interface DemoScenario {
  id: DemoScenarioId
  /** Presenter-facing name. The audience sees the product, not this. */
  name: string
  steps: ScenarioStep[]
  /**
   * A profile this scenario demonstrates. Applied on selection and restored
   * on reset or on leaving demo mode; the person's real profile survives.
   */
  profilePreset?: Partial<UserProfile>
}

export type DemoScenarioId =
  | 'no-warning'
  | 'emergency-here'
  | 'escalation'
  | 'not-affected'
  | 'feed-loss'
  | 'accessibility-profile'

export function buildScenarios(anchor: LatLon, anchorLabel: string): DemoScenario[] {
  const emergencyHere = (minute: number) =>
    demoWarning(anchor, anchorLabel, 2, {
      level: 'emergency-warning',
      status: 'Out of control',
      sizeHa: 840,
      rawAdvice:
        'You are in danger and need to act immediately to survive. ' +
        'The fire is approaching and conditions are dangerous. ' +
        'If you are not prepared, leave now towards the east.',
    }, minute, [ringAround(anchor, 3)])

  return [
    {
      id: 'no-warning',
      name: '1 · No active warning',
      steps: [{ atMs: 0, label: 'Quiet', warnings: [] }],
    },
    {
      id: 'emergency-here',
      name: '2 · Emergency at your location',
      steps: [{ atMs: 0, label: 'Emergency Warning', warnings: [emergencyHere(0)] }],
    },
    {
      id: 'escalation',
      name: '3 · Warning changes',
      steps: buildScenario(anchor, anchorLabel),
    },
    {
      id: 'not-affected',
      name: '4 · Warning elsewhere',
      steps: [{
        atMs: 0,
        label: 'Not affected',
        warnings: [
          // ~25 km north, with a polygon that excludes the anchor: close
          // enough to surface, far enough that the verdict is a clean
          // "no official warning covers your location".
          demoWarning(anchor, anchorLabel, 25, {
            level: 'emergency-warning',
            status: 'Out of control',
            sizeHa: 300,
            rawAdvice: 'A fire is burning north of the area.',
          }, 0, [ringAround({ lat: anchor.lat + 25 * KM_IN_DEGREES, lon: anchor.lon }, 3)],
          'safesignal-demo-elsewhere'),
        ],
      }],
    },
    {
      id: 'feed-loss',
      name: '5 · Feed becomes unavailable',
      steps: [
        {
          atMs: 0,
          label: 'Fresh data',
          warnings: [],
        },
        {
          atMs: 8_000,
          label: 'Data going stale',
          warnings: [],
          feedState: { stale: true, freshness: 'stale' },
        },
        {
          atMs: 16_000,
          label: 'Feed unreachable',
          warnings: [],
          feedState: { stale: true, freshness: 'stale', failure: 'network' },
        },
      ],
    },
    {
      id: 'accessibility-profile',
      name: '6 · Mandarin · large text · audio · mobility',
      steps: [{ atMs: 0, label: 'Emergency Warning', warnings: [emergencyHere(0)] }],
      profilePreset: {
        language: 'zh',
        textSize: 'large',
        audio: true,
        needs: ['mobility'],
        transport: 'needs-assistance',
      },
    },
  ]
}
