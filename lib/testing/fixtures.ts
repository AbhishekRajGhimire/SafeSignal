import type { Warning, WarningProvenance } from '@/lib/domain/warning'

/**
 * Test fixtures. Not imported by any application code, so this never reaches
 * the bundle.
 */

export const TEST_PROVENANCE: WarningProvenance = {
  source: 'nsw-rfs',
  sourceName: 'NSW Rural Fire Service',
  feedUrl: 'https://www.rfs.nsw.gov.au/feeds/majorIncidents.json',
  copyright: 'State of New South Wales (NSW Rural Fire Service)',
  retrievedAt: new Date('2026-08-30T00:00:00.000Z'),
  feedLastModified: null,
  transform: 'normalized',
}

export const BASE_WARNING: Warning = {
  id: 'test-incident',
  level: 'advice',
  title: 'GREEN GULLY TRAIL, KATOOMBA',
  location: 'Green Gully Trail, Katoomba',
  council: 'Blue Mountains',
  status: 'Out of control',
  type: 'Bush Fire',
  sizeHa: 120,
  agency: 'Rural Fire Service',
  updatedAt: new Date('2026-08-30T04:00:00.000Z'),
  publishedAt: new Date('2026-08-30T03:00:00.000Z'),
  point: { lat: -33.72, lon: 150.31 },
  polygons: [],
  officialUrl: 'https://www.rfs.nsw.gov.au/fire-information/fires-near-me',
  rawAdvice: null,
  fields: {},
  raw: { properties: {}, geometry: null },
  provenance: TEST_PROVENANCE,
}

export function makeWarning(overrides: Partial<Warning> = {}): Warning {
  return { ...BASE_WARNING, ...overrides }
}
