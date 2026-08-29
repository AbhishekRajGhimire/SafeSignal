# SafeSignal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a mobile-first PWA that renders official NSW RFS bushfire warnings in plain language, in four languages, with speech and a profile-aware help layer, in both live and demo modes.

**Architecture:** A tiny server owns only the CORS-blocked feed fetch and the Claude API key. It normalizes the messy RFS payload into `Warning` objects. Everything else runs in the browser: location matching, language rendering, speech, and help. The whole app consumes a single `WarningSource` interface with two implementations, `LiveSource` and `DemoSource`, so demo mode exercises the real application rather than a parallel fake.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, plain CSS with custom properties, Vitest. No Tailwind, no UI library, no state library, no database.

**Spec:** `docs/superpowers/specs/2026-08-29-safesignal-design.md`

## Global Constraints

- **SafeSignal never creates emergency advice.** Every user-facing claim traces to the RFS feed or to a fixed official phone number. Plain-language text is always shown next to the exact official English wording.
- **No user data leaves the device.** `/api/warnings` takes no parameters. Location, mobility, transport, and language live in `localStorage` only.
- **Never render a blank screen or an error page.** Every failure degrades to something useful and states its data freshness.
- **Languages:** exactly `en`, `zh` (Mandarin Simplified), `hi` (Hindi), `vi` (Vietnamese). All left-to-right. No RTL work.
- **Alert levels:** exactly `emergency-warning`, `watch-and-act`, `advice`, `planned-burn`, `not-applicable`.
- **`not-applicable` is parsed and retained but never surfaced as a warning.**
- **All RFS timestamps are `Australia/Sydney` wall time** and must be converted through the offset helper, never through bare `new Date(string)`.
- **Alert level is never signalled by colour alone.** Colour plus icon plus word, always.
- **Node 24, npm 11.** Tests run with `npm test`.

## File Structure

```
package.json  tsconfig.json  next.config.ts  vitest.config.ts
app/
  layout.tsx              root shell, text-scale attribute, language attribute
  globals.css             design tokens, type scale, alert level tokens
  page.tsx                main warning screen
  setup/page.tsx          first-run preferences wizard
  api/warnings/route.ts   server: fetch, normalize, cache, stale fallback
  api/simplify/route.ts   server: Claude plain-language rewrite
lib/
  rfs/
    time.ts               Sydney wall-time conversion
    parse.ts              description key/value + date + size parsing
    normalize.ts          raw feature -> Warning
    fetch.ts              feed fetch + 30s cache + last-good fallback
  domain/
    warning.ts            Warning, AlertLevel, wire types, severity order
    geo.ts                haversine, point-in-polygon
    match.ts              relevance banding, sorting
    profile.ts            UserProfile, localStorage read/write
  sources/
    types.ts              WarningSource
    live.ts               polls /api/warnings
    scenario.ts           demo escalation fixture
    demo.ts               DemoSource with play/pause/seek
  i18n/
    types.ts              PhrasePack, UIKey
    phrases/{en,zh,hi,vi}.ts
    index.ts              pack registry
    render.ts             Warning + lang -> RenderedWarning
  speech/tts.ts           speechSynthesis wrapper, voice detection
  help/
    services.ts           official service directory + filtering
    callScript.ts         English call script builder
    checklist.ts          official action checklist
    share.ts              share message composer
  locations/nsw.ts        NSW town/suburb centroids
components/               UI components, one responsibility each
public/manifest.json  public/sw.js  public/demo-audio/
```

Tests are colocated as `lib/**/*.test.ts` and run in the `node` environment.

---

### Task 1: Project scaffold and test harness

Scaffolds manually rather than with `create-next-app`, because the directory already contains `.gitignore` and `docs/`, which `create-next-app` treats as conflicts and refuses.

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `next-env.d.ts`
- Create: `app/layout.tsx`, `app/page.tsx`, `app/globals.css`
- Test: `lib/sanity.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: a working `npm test` and `npm run dev`; the `@/` path alias resolving to the repo root

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "safesignal",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "next": "^15.1.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "typescript": "^5.7.0",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create `next.config.ts` and `next-env.d.ts`**

`next.config.ts`:

```ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
}

export default nextConfig
```

`next-env.d.ts`:

```ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />
```

- [ ] **Step 4: Create `vitest.config.ts`**

Uses `fileURLToPath` rather than `__dirname`, which does not exist in an ESM config file, and which would otherwise produce a broken path on Windows.

```ts
import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
  },
  resolve: {
    alias: { '@': root },
  },
})
```

- [ ] **Step 5: Write the sanity test**

`lib/sanity.test.ts`:

```ts
import { describe, it, expect } from 'vitest'

describe('test harness', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 6: Install and run the test**

```bash
npm install
npm test
```

Expected: 1 passing test.

- [ ] **Step 7: Create the minimal app shell**

`app/globals.css`:

```css
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  background: #ffffff;
  color: #111318;
}
```

`app/layout.tsx`:

```tsx
import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'SafeSignal',
  description: 'Official NSW bushfire warnings, made understandable.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
```

`app/page.tsx`:

```tsx
export default function Home() {
  return <main><h1>SafeSignal</h1></main>
}
```

- [ ] **Step 8: Verify the dev server boots**

```bash
npm run dev
```

Expected: server listening on `http://localhost:3000`, page renders "SafeSignal". Stop the server afterwards.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "Scaffold Next.js app with Vitest"
```

---

### Task 2: Sydney wall-time conversion

RFS timestamps carry no timezone and are Sydney local time. On Vercel the server runs in UTC, so a naive parse renders every timestamp wrong by ten or eleven hours. This task exists on its own because every date in the system flows through it.

**Files:**
- Create: `lib/rfs/time.ts`
- Test: `lib/rfs/time.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `fromSydneyWallTime(y: number, month: number, d: number, h: number, min: number, s: number): Date` where `month` is 1-based

- [ ] **Step 1: Write the failing test**

`lib/rfs/time.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { fromSydneyWallTime } from './time'

describe('fromSydneyWallTime', () => {
  it('converts an AEST (winter, UTC+10) wall time to the correct instant', () => {
    // 29 Aug 2026 04:12 Sydney == 28 Aug 2026 18:12 UTC
    const d = fromSydneyWallTime(2026, 8, 29, 4, 12, 0)
    expect(d.toISOString()).toBe('2026-08-28T18:12:00.000Z')
  })

  it('converts an AEDT (summer, UTC+11) wall time to the correct instant', () => {
    // 15 Jan 2026 16:12 Sydney == 15 Jan 2026 05:12 UTC
    const d = fromSydneyWallTime(2026, 1, 15, 16, 12, 0)
    expect(d.toISOString()).toBe('2026-01-15T05:12:00.000Z')
  })

  it('handles midnight without rolling the date', () => {
    // 1 Jul 2026 00:00 Sydney == 30 Jun 2026 14:00 UTC
    const d = fromSydneyWallTime(2026, 7, 1, 0, 0, 0)
    expect(d.toISOString()).toBe('2026-06-30T14:00:00.000Z')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- lib/rfs/time.test.ts
```

Expected: FAIL, cannot resolve `./time`.

- [ ] **Step 3: Implement**

`lib/rfs/time.ts`:

```ts
const SYDNEY = 'Australia/Sydney'

const formatter = new Intl.DateTimeFormat('en-US', {
  timeZone: SYDNEY,
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

/**
 * Minutes that Sydney is ahead of UTC at the given instant (+600 or +660).
 * Formats the instant as Sydney wall time, reads it back as if it were UTC,
 * and measures the gap.
 */
function sydneyOffsetMinutes(instant: Date): number {
  const parts: Record<string, string> = {}
  for (const part of formatter.formatToParts(instant)) {
    if (part.type !== 'literal') parts[part.type] = part.value
  }
  const asIfUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  )
  return (asIfUtc - instant.getTime()) / 60_000
}

/**
 * Builds the UTC instant for a Sydney wall-clock reading.
 * `month` is 1-based. Resolves the offset twice so that readings near a
 * daylight-saving boundary settle on the correct side of the transition.
 */
export function fromSydneyWallTime(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute, second)
  let offset = sydneyOffsetMinutes(new Date(naive))
  let instant = naive - offset * 60_000
  const settled = sydneyOffsetMinutes(new Date(instant))
  if (settled !== offset) {
    offset = settled
    instant = naive - offset * 60_000
  }
  return new Date(instant)
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test -- lib/rfs/time.test.ts
```

Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add lib/rfs/time.ts lib/rfs/time.test.ts
git commit -m "Add Sydney wall-time conversion for RFS timestamps"
```

---

### Task 3: RFS description and field parsing

**Files:**
- Create: `lib/rfs/parse.ts`
- Test: `lib/rfs/parse.test.ts`

**Interfaces:**
- Consumes: `fromSydneyWallTime` from Task 2
- Produces:
  - `parseDescription(description: string): Record<string, string>` with UPPERCASE keys
  - `parsePubDate(value: string | undefined): Date | null` for `29/08/2026 4:12:00 AM`
  - `parseUpdated(value: string | undefined): Date | null` for `29 Aug 2026 14:12`
  - `parseSizeHa(value: string | undefined): number | null`

- [ ] **Step 1: Write the failing tests**

`lib/rfs/parse.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseDescription, parsePubDate, parseUpdated, parseSizeHa } from './parse'

const REAL = [
  'ALERT LEVEL: Advice ',
  'LOCATION: ALTINIER RD, TUNCESTER 2480 ',
  'COUNCIL AREA: Lismore ',
  'STATUS: Under control ',
  'TYPE: Grass Fire ',
  'FIRE: Yes ',
  'SIZE: 0 ha ',
  'RESPONSIBLE AGENCY: Rural Fire Service ',
  'UPDATED: 29 Aug 2026 14:12',
].join('<br />')

describe('parseDescription', () => {
  it('reads every key from a real feed description', () => {
    const f = parseDescription(REAL)
    expect(f['ALERT LEVEL']).toBe('Advice')
    expect(f['LOCATION']).toBe('ALTINIER RD, TUNCESTER 2480')
    expect(f['COUNCIL AREA']).toBe('Lismore')
    expect(f['STATUS']).toBe('Under control')
    expect(f['SIZE']).toBe('0 ha')
    expect(f['UPDATED']).toBe('29 Aug 2026 14:12')
  })

  it('keeps values that themselves contain a colon', () => {
    expect(parseDescription('UPDATED: 29 Aug 2026 14:12')['UPDATED'])
      .toBe('29 Aug 2026 14:12')
  })

  it('retains keys it does not recognise', () => {
    expect(parseDescription('NEW FIELD: hello')['NEW FIELD']).toBe('hello')
  })

  it('tolerates break tag variants', () => {
    const f = parseDescription('A: 1<br/>B: 2<BR />C: 3<br>D: 4')
    expect(f).toEqual({ A: '1', B: '2', C: '3', D: '4' })
  })

  it('returns an empty object for empty or junk input', () => {
    expect(parseDescription('')).toEqual({})
    expect(parseDescription('no colon here')).toEqual({})
  })
})

describe('parsePubDate', () => {
  it('reads the day-first format rather than month-first', () => {
    // 29/08 is 29 August, NOT 8 September
    const d = parsePubDate('29/08/2026 4:12:00 AM')
    expect(d?.toISOString()).toBe('2026-08-28T18:12:00.000Z')
  })

  it('handles PM correctly', () => {
    const d = parsePubDate('29/08/2026 4:12:00 PM')
    expect(d?.toISOString()).toBe('2026-08-29T06:12:00.000Z')
  })

  it('treats 12 AM as midnight and 12 PM as noon', () => {
    expect(parsePubDate('01/07/2026 12:00:00 AM')?.toISOString())
      .toBe('2026-06-30T14:00:00.000Z')
    expect(parsePubDate('01/07/2026 12:00:00 PM')?.toISOString())
      .toBe('2026-07-01T02:00:00.000Z')
  })

  it('returns null rather than throwing on junk', () => {
    expect(parsePubDate('not a date')).toBeNull()
    expect(parsePubDate(undefined)).toBeNull()
  })
})

describe('parseUpdated', () => {
  it('reads the abbreviated-month 24-hour format', () => {
    expect(parseUpdated('29 Aug 2026 14:12')?.toISOString())
      .toBe('2026-08-29T04:12:00.000Z')
  })

  it('returns null rather than throwing on junk', () => {
    expect(parseUpdated('29 Xxx 2026 14:12')).toBeNull()
    expect(parseUpdated(undefined)).toBeNull()
  })
})

describe('parseSizeHa', () => {
  it('reads plain and comma-grouped hectare values', () => {
    expect(parseSizeHa('0 ha')).toBe(0)
    expect(parseSizeHa('1,234 ha')).toBe(1234)
    expect(parseSizeHa('12.5 ha')).toBe(12.5)
  })

  it('returns null when there is no number', () => {
    expect(parseSizeHa('unknown')).toBeNull()
    expect(parseSizeHa(undefined)).toBeNull()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm test -- lib/rfs/parse.test.ts
```

Expected: FAIL, cannot resolve `./parse`.

- [ ] **Step 3: Implement**

`lib/rfs/parse.ts`:

```ts
import { fromSydneyWallTime } from './time'

const BREAK = /<br\s*\/?>/gi

/**
 * The RFS `description` field is a run of `KEY: value` pairs joined by
 * literal break tags. Unknown keys are kept rather than rejected, because
 * the RFS can add fields without notice.
 */
export function parseDescription(description: string): Record<string, string> {
  const fields: Record<string, string> = {}
  if (!description) return fields

  for (const segment of description.split(BREAK)) {
    const colon = segment.indexOf(':')
    if (colon === -1) continue
    const key = segment.slice(0, colon).trim().toUpperCase()
    const value = segment.slice(colon + 1).trim()
    if (key) fields[key] = value
  }
  return fields
}

const PUB_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)$/i

/** Parses `29/08/2026 4:12:00 AM`. Day first, Sydney local time. */
export function parsePubDate(value: string | undefined): Date | null {
  if (!value) return null
  const m = PUB_DATE.exec(value.trim())
  if (!m) return null

  const [, day, month, year, rawHour, minute, second, meridiem] = m
  let hour = Number(rawHour)
  if (hour < 1 || hour > 12) return null
  if (meridiem.toUpperCase() === 'PM' && hour !== 12) hour += 12
  if (meridiem.toUpperCase() === 'AM' && hour === 12) hour = 0

  return buildIfValid(Number(year), Number(month), Number(day), hour, Number(minute), Number(second))
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

const UPDATED = /^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})\s+(\d{1,2}):(\d{2})$/

/** Parses `29 Aug 2026 14:12`. 24-hour, Sydney local time. */
export function parseUpdated(value: string | undefined): Date | null {
  if (!value) return null
  const m = UPDATED.exec(value.trim())
  if (!m) return null

  const [, day, monthName, year, hour, minute] = m
  const month = MONTHS[monthName.slice(0, 3).toLowerCase()]
  if (!month) return null

  return buildIfValid(Number(year), month, Number(day), Number(hour), Number(minute), 0)
}

function buildIfValid(
  year: number, month: number, day: number,
  hour: number, minute: number, second: number,
): Date | null {
  if (month < 1 || month > 12) return null
  if (day < 1 || day > 31) return null
  if (hour > 23 || minute > 59 || second > 59) return null
  const date = fromSydneyWallTime(year, month, day, hour, minute, second)
  return Number.isNaN(date.getTime()) ? null : date
}

/** Parses `0 ha`, `1,234 ha`, `12.5 ha`. */
export function parseSizeHa(value: string | undefined): number | null {
  if (!value) return null
  const m = /(\d[\d,]*(?:\.\d+)?)/.exec(value)
  if (!m) return null
  const size = Number(m[1].replace(/,/g, ''))
  return Number.isFinite(size) ? size : null
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm test -- lib/rfs/parse.test.ts
```

Expected: all passing.

- [ ] **Step 5: Commit**

```bash
git add lib/rfs/parse.ts lib/rfs/parse.test.ts
git commit -m "Add RFS description, date, and size parsing"
```

---

### Task 4: Domain types and wire format

`Warning` holds real `Date` objects, but it crosses the network as JSON. Rather than leaving every caller to guess whether it holds a `Date` or a string, this task defines the wire type and the conversion in one place.

`updatedAt` and `publishedAt` are nullable, following the spec rule that a missing or unparseable field becomes null rather than throwing.

Polygons are stored as outer rings only. Fire polygons in this feed do not use holes, and ignoring them keeps point-in-polygon simple.

**Files:**
- Create: `lib/domain/warning.ts`
- Test: `lib/domain/warning.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `type AlertLevel`, `interface LatLon`, `type PolygonRing = LatLon[]`
  - `interface Warning`, `type WarningWire`
  - `SEVERITY: Record<AlertLevel, number>`
  - `isSurfaceable(level: AlertLevel): boolean`
  - `toWire(w: Warning): WarningWire`, `fromWire(w: WarningWire): Warning`

- [ ] **Step 1: Write the failing test**

`lib/domain/warning.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { toWire, fromWire, isSurfaceable, SEVERITY, type Warning } from './warning'

const sample: Warning = {
  id: 'incident-1',
  level: 'advice',
  title: 'ALTINIER RD, TUNCESTER',
  location: 'ALTINIER RD, TUNCESTER 2480',
  council: 'Lismore',
  status: 'Under control',
  type: 'Grass Fire',
  sizeHa: 0,
  agency: 'Rural Fire Service',
  updatedAt: new Date('2026-08-29T04:12:00.000Z'),
  publishedAt: new Date('2026-08-28T18:12:00.000Z'),
  point: { lat: -28.8076, lon: 153.2091 },
  polygons: [[{ lat: -28.8, lon: 153.2 }, { lat: -28.81, lon: 153.21 }, { lat: -28.82, lon: 153.2 }]],
  officialUrl: 'https://www.rfs.nsw.gov.au/fire-information/fires-near-me',
  rawAdvice: null,
}

describe('wire conversion', () => {
  it('round-trips a warning without losing data', () => {
    expect(fromWire(toWire(sample))).toEqual(sample)
  })

  it('serialises dates as ISO strings', () => {
    expect(toWire(sample).updatedAt).toBe('2026-08-29T04:12:00.000Z')
  })

  it('carries null dates through both directions', () => {
    const undated = { ...sample, updatedAt: null, publishedAt: null }
    expect(toWire(undated).updatedAt).toBeNull()
    expect(fromWire(toWire(undated)).updatedAt).toBeNull()
  })
})

describe('isSurfaceable', () => {
  it('excludes not-applicable, which dominates the live feed', () => {
    expect(isSurfaceable('not-applicable')).toBe(false)
  })

  it('includes every real alert level', () => {
    expect(isSurfaceable('emergency-warning')).toBe(true)
    expect(isSurfaceable('watch-and-act')).toBe(true)
    expect(isSurfaceable('advice')).toBe(true)
    expect(isSurfaceable('planned-burn')).toBe(true)
  })
})

describe('SEVERITY', () => {
  it('ranks emergency warning above every other level', () => {
    expect(SEVERITY['emergency-warning']).toBeGreaterThan(SEVERITY['watch-and-act'])
    expect(SEVERITY['watch-and-act']).toBeGreaterThan(SEVERITY['advice'])
    expect(SEVERITY['advice']).toBeGreaterThan(SEVERITY['planned-burn'])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- lib/domain/warning.test.ts
```

Expected: FAIL, cannot resolve `./warning`.

- [ ] **Step 3: Implement**

`lib/domain/warning.ts`:

```ts
export type AlertLevel =
  | 'emergency-warning'
  | 'watch-and-act'
  | 'advice'
  | 'planned-burn'
  | 'not-applicable'

export const ALERT_LEVELS: readonly AlertLevel[] = [
  'emergency-warning',
  'watch-and-act',
  'advice',
  'planned-burn',
  'not-applicable',
] as const

/** Higher is more urgent. Drives sort order everywhere. */
export const SEVERITY: Record<AlertLevel, number> = {
  'emergency-warning': 4,
  'watch-and-act': 3,
  advice: 2,
  'planned-burn': 1,
  'not-applicable': 0,
}

export interface LatLon {
  lat: number
  lon: number
}

/** Outer ring of a polygon. Holes are intentionally not modelled. */
export type PolygonRing = LatLon[]

export interface Warning {
  id: string
  level: AlertLevel
  title: string
  location: string
  council: string
  status: string
  type: string
  sizeHa: number | null
  agency: string
  updatedAt: Date | null
  publishedAt: Date | null
  point: LatLon | null
  polygons: PolygonRing[]
  officialUrl: string
  rawAdvice: string | null
}

export type WarningWire = Omit<Warning, 'updatedAt' | 'publishedAt'> & {
  updatedAt: string | null
  publishedAt: string | null
}

/**
 * `not-applicable` incidents are 41 of 53 features in a typical feed.
 * They carry no alert level, so surfacing them would bury the real
 * warnings and train users to ignore the app.
 */
export function isSurfaceable(level: AlertLevel): boolean {
  return level !== 'not-applicable'
}

export function toWire(warning: Warning): WarningWire {
  return {
    ...warning,
    updatedAt: warning.updatedAt ? warning.updatedAt.toISOString() : null,
    publishedAt: warning.publishedAt ? warning.publishedAt.toISOString() : null,
  }
}

export function fromWire(wire: WarningWire): Warning {
  return {
    ...wire,
    updatedAt: wire.updatedAt ? new Date(wire.updatedAt) : null,
    publishedAt: wire.publishedAt ? new Date(wire.publishedAt) : null,
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test -- lib/domain/warning.test.ts
```

Expected: all passing.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/warning.ts lib/domain/warning.test.ts
git commit -m "Add Warning domain type and wire format"
```

---

### Task 5: Normalize the RFS feed

**Files:**
- Create: `lib/rfs/normalize.ts`
- Test: `lib/rfs/normalize.test.ts`

**Interfaces:**
- Consumes: `parseDescription`, `parsePubDate`, `parseUpdated`, `parseSizeHa` (Task 3); `Warning`, `AlertLevel`, `LatLon`, `PolygonRing` (Task 4)
- Produces:
  - `normalizeFeature(feature: unknown): Warning | null`
  - `normalizeFeed(raw: unknown): { warnings: Warning[]; dropped: number }`

- [ ] **Step 1: Write the failing test**

`lib/rfs/normalize.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { normalizeFeature, normalizeFeed } from './normalize'

const description = [
  'ALERT LEVEL: Advice ',
  'LOCATION: ALTINIER RD, TUNCESTER 2480 ',
  'COUNCIL AREA: Lismore ',
  'STATUS: Under control ',
  'TYPE: Grass Fire ',
  'FIRE: Yes ',
  'SIZE: 0 ha ',
  'RESPONSIBLE AGENCY: Rural Fire Service ',
  'UPDATED: 29 Aug 2026 14:12',
].join('<br />')

const pointFeature = {
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [153.209163148, -28.807605556] },
  properties: {
    title: 'ALTINIER RD, TUNCESTER',
    link: 'https://www.rfs.nsw.gov.au/fire-information/fires-near-me',
    category: 'Advice',
    guid: 'https://incidents.rfs.nsw.gov.au/api/v1/incidents/673192',
    pubDate: '29/08/2026 4:12:00 AM',
    description,
  },
}

describe('normalizeFeature', () => {
  it('maps every parsed field onto the Warning', () => {
    const w = normalizeFeature(pointFeature)!
    expect(w.id).toBe('https://incidents.rfs.nsw.gov.au/api/v1/incidents/673192')
    expect(w.level).toBe('advice')
    expect(w.title).toBe('ALTINIER RD, TUNCESTER')
    expect(w.council).toBe('Lismore')
    expect(w.status).toBe('Under control')
    expect(w.sizeHa).toBe(0)
    expect(w.updatedAt?.toISOString()).toBe('2026-08-29T04:12:00.000Z')
  })

  it('reads GeoJSON coordinates as [lon, lat], not [lat, lon]', () => {
    const w = normalizeFeature(pointFeature)!
    expect(w.point).toEqual({ lat: -28.807605556, lon: 153.209163148 })
  })

  it('maps every category to its alert level', () => {
    const level = (category: string) =>
      normalizeFeature({ ...pointFeature, properties: { ...pointFeature.properties, category } })!.level
    expect(level('Emergency Warning')).toBe('emergency-warning')
    expect(level('Watch and Act')).toBe('watch-and-act')
    expect(level('Advice')).toBe('advice')
    expect(level('Planned Burn')).toBe('planned-burn')
    expect(level('Not Applicable')).toBe('not-applicable')
  })

  it('falls back to not-applicable for an unrecognised category', () => {
    const w = normalizeFeature({
      ...pointFeature,
      properties: { ...pointFeature.properties, category: 'Something New' },
    })!
    expect(w.level).toBe('not-applicable')
  })

  it('pulls the point and every polygon out of a nested GeometryCollection', () => {
    const w = normalizeFeature({
      ...pointFeature,
      geometry: {
        type: 'GeometryCollection',
        geometries: [
          { type: 'Point', coordinates: [153.2, -28.8] },
          {
            type: 'GeometryCollection',
            geometries: [
              { type: 'Polygon', coordinates: [[[153.0, -28.0], [153.1, -28.0], [153.1, -28.1], [153.0, -28.0]]] },
            ],
          },
        ],
      },
    })!
    expect(w.point).toEqual({ lat: -28.8, lon: 153.2 })
    expect(w.polygons).toHaveLength(1)
    expect(w.polygons[0][0]).toEqual({ lat: -28.0, lon: 153.0 })
  })

  it('returns null rather than throwing on junk', () => {
    expect(normalizeFeature(null)).toBeNull()
    expect(normalizeFeature({})).toBeNull()
    expect(normalizeFeature({ properties: {} })).toBeNull()
  })

  it('survives a feature with no geometry at all', () => {
    const w = normalizeFeature({ ...pointFeature, geometry: null })!
    expect(w.point).toBeNull()
    expect(w.polygons).toEqual([])
  })
})

describe('normalizeFeed', () => {
  it('counts what it drops instead of throwing', () => {
    const result = normalizeFeed({
      type: 'FeatureCollection',
      features: [pointFeature, null, { nonsense: true }],
    })
    expect(result.warnings).toHaveLength(1)
    expect(result.dropped).toBe(2)
  })

  it('returns empty rather than throwing when the payload is not a feed', () => {
    expect(normalizeFeed(null)).toEqual({ warnings: [], dropped: 0 })
    expect(normalizeFeed({ nope: 1 })).toEqual({ warnings: [], dropped: 0 })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- lib/rfs/normalize.test.ts
```

Expected: FAIL, cannot resolve `./normalize`.

- [ ] **Step 3: Implement**

`lib/rfs/normalize.ts`:

```ts
import { parseDescription, parsePubDate, parseUpdated, parseSizeHa } from './parse'
import type { AlertLevel, LatLon, PolygonRing, Warning } from '@/lib/domain/warning'

const CATEGORY_TO_LEVEL: Record<string, AlertLevel> = {
  'emergency warning': 'emergency-warning',
  'watch and act': 'watch-and-act',
  advice: 'advice',
  'planned burn': 'planned-burn',
  'not applicable': 'not-applicable',
}

function toLevel(category: unknown): AlertLevel {
  if (typeof category !== 'string') return 'not-applicable'
  return CATEGORY_TO_LEVEL[category.trim().toLowerCase()] ?? 'not-applicable'
}

/** GeoJSON positions are [lon, lat]. Getting this backwards puts NSW in Kazakhstan. */
function toLatLon(position: unknown): LatLon | null {
  if (!Array.isArray(position) || position.length < 2) return null
  const [lon, lat] = position
  if (typeof lat !== 'number' || typeof lon !== 'number') return null
  return { lat, lon }
}

interface Collected {
  point: LatLon | null
  polygons: PolygonRing[]
}

/** Walks Point / Polygon / MultiPolygon / nested GeometryCollection. */
function collectGeometry(geometry: unknown, into: Collected): void {
  if (!geometry || typeof geometry !== 'object') return
  const g = geometry as { type?: unknown; coordinates?: unknown; geometries?: unknown }

  if (g.type === 'Point') {
    if (!into.point) {
      const point = toLatLon(g.coordinates)
      if (point) into.point = point
    }
    return
  }

  if (g.type === 'Polygon' && Array.isArray(g.coordinates)) {
    const outer = g.coordinates[0]
    if (Array.isArray(outer)) {
      const ring = outer.map(toLatLon).filter((p): p is LatLon => p !== null)
      if (ring.length >= 3) into.polygons.push(ring)
    }
    return
  }

  if (g.type === 'MultiPolygon' && Array.isArray(g.coordinates)) {
    for (const polygon of g.coordinates) {
      collectGeometry({ type: 'Polygon', coordinates: polygon }, into)
    }
    return
  }

  if (g.type === 'GeometryCollection' && Array.isArray(g.geometries)) {
    for (const child of g.geometries) collectGeometry(child, into)
  }
}

export function normalizeFeature(feature: unknown): Warning | null {
  if (!feature || typeof feature !== 'object') return null
  const f = feature as { geometry?: unknown; properties?: unknown }
  if (!f.properties || typeof f.properties !== 'object') return null

  const p = f.properties as Record<string, unknown>
  const title = typeof p.title === 'string' ? p.title.trim() : ''
  const guid = typeof p.guid === 'string' ? p.guid : ''
  if (!title && !guid) return null

  const description = typeof p.description === 'string' ? p.description : ''
  const fields = parseDescription(description)

  const geometry: Collected = { point: null, polygons: [] }
  collectGeometry(f.geometry, geometry)

  return {
    id: guid || title,
    level: toLevel(p.category),
    title: title || fields['LOCATION'] || 'Unknown location',
    location: fields['LOCATION'] ?? '',
    council: fields['COUNCIL AREA'] ?? '',
    status: fields['STATUS'] ?? '',
    type: fields['TYPE'] ?? '',
    sizeHa: parseSizeHa(fields['SIZE']),
    agency: fields['RESPONSIBLE AGENCY'] ?? '',
    updatedAt: parseUpdated(fields['UPDATED']),
    publishedAt: parsePubDate(typeof p.pubDate === 'string' ? p.pubDate : undefined),
    point: geometry.point,
    polygons: geometry.polygons,
    officialUrl:
      typeof p.link === 'string' && p.link
        ? p.link
        : 'https://www.rfs.nsw.gov.au/fire-information/fires-near-me',
    rawAdvice: null,
  }
}

export function normalizeFeed(raw: unknown): { warnings: Warning[]; dropped: number } {
  if (!raw || typeof raw !== 'object') return { warnings: [], dropped: 0 }
  const features = (raw as { features?: unknown }).features
  if (!Array.isArray(features)) return { warnings: [], dropped: 0 }

  const warnings: Warning[] = []
  let dropped = 0

  for (const feature of features) {
    const warning = normalizeFeature(feature)
    if (warning) warnings.push(warning)
    else dropped += 1
  }

  return { warnings, dropped }
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test -- lib/rfs/normalize.test.ts
```

Expected: all passing.

- [ ] **Step 5: Commit**

```bash
git add lib/rfs/normalize.ts lib/rfs/normalize.test.ts
git commit -m "Add RFS feed normalization to Warning objects"
```

---

### Task 6: Feed fetch with cache and the warnings API route

The route always returns HTTP 200, even when the upstream feed fails. A 500 would give the client nothing to render, and the governing constraint is that SafeSignal never shows an error page. Failure is communicated by the `stale` flag and the `fetchedAt` timestamp instead.

**Files:**
- Create: `lib/rfs/fetch.ts`, `app/api/warnings/route.ts`
- Test: `lib/rfs/fetch.test.ts`

**Interfaces:**
- Consumes: `normalizeFeed` (Task 5); `Warning`, `WarningWire`, `toWire` (Task 4)
- Produces:
  - `FEED_URL: string`
  - `interface FeedSnapshot { warnings: Warning[]; fetchedAt: Date | null; stale: boolean; dropped: number }`
  - `getFeed(): Promise<FeedSnapshot>`
  - `__resetFeedCacheForTests(): void`
  - `interface WarningsResponse { warnings: WarningWire[]; fetchedAt: string | null; stale: boolean; dropped: number }`

- [ ] **Step 1: Write the failing test**

`lib/rfs/fetch.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getFeed, __resetFeedCacheForTests } from './fetch'

const feedPayload = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [153.2, -28.8] },
      properties: {
        title: 'TEST FIRE',
        link: 'https://example.invalid',
        category: 'Advice',
        guid: 'incident-1',
        pubDate: '29/08/2026 4:12:00 AM',
        description: 'ALERT LEVEL: Advice <br />STATUS: Under control',
      },
    },
  ],
}

function mockFetchOnce(ok: boolean, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 502,
    json: async () => body,
  })
}

beforeEach(() => {
  __resetFeedCacheForTests()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-08-29T12:00:00.000Z'))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('getFeed', () => {
  it('fetches and normalizes the feed', async () => {
    vi.stubGlobal('fetch', mockFetchOnce(true, feedPayload))
    const snapshot = await getFeed()
    expect(snapshot.warnings).toHaveLength(1)
    expect(snapshot.stale).toBe(false)
    expect(snapshot.fetchedAt?.toISOString()).toBe('2026-08-29T12:00:00.000Z')
  })

  it('serves the cache without refetching inside the 30 second window', async () => {
    const fetchMock = mockFetchOnce(true, feedPayload)
    vi.stubGlobal('fetch', fetchMock)
    await getFeed()
    vi.setSystemTime(new Date('2026-08-29T12:00:20.000Z'))
    await getFeed()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('refetches once the cache window has passed', async () => {
    const fetchMock = mockFetchOnce(true, feedPayload)
    vi.stubGlobal('fetch', fetchMock)
    await getFeed()
    vi.setSystemTime(new Date('2026-08-29T12:00:31.000Z'))
    await getFeed()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('serves the last good payload marked stale when the upstream fails', async () => {
    vi.stubGlobal('fetch', mockFetchOnce(true, feedPayload))
    await getFeed()

    vi.setSystemTime(new Date('2026-08-29T12:01:00.000Z'))
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    const snapshot = await getFeed()

    expect(snapshot.warnings).toHaveLength(1)
    expect(snapshot.stale).toBe(true)
    expect(snapshot.fetchedAt?.toISOString()).toBe('2026-08-29T12:00:00.000Z')
  })

  it('returns an empty stale snapshot when it fails with nothing cached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    const snapshot = await getFeed()
    expect(snapshot.warnings).toEqual([])
    expect(snapshot.stale).toBe(true)
    expect(snapshot.fetchedAt).toBeNull()
  })

  it('treats a non-ok response as a failure', async () => {
    vi.stubGlobal('fetch', mockFetchOnce(false, {}))
    const snapshot = await getFeed()
    expect(snapshot.stale).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- lib/rfs/fetch.test.ts
```

Expected: FAIL, cannot resolve `./fetch`.

- [ ] **Step 3: Implement the fetch layer**

`lib/rfs/fetch.ts`:

```ts
import { normalizeFeed } from './normalize'
import type { Warning, WarningWire } from '@/lib/domain/warning'

export const FEED_URL = 'https://www.rfs.nsw.gov.au/feeds/majorIncidents.json'

/** Matches the cache lifetime the feed declares for itself. */
const CACHE_MS = 30_000

export interface FeedSnapshot {
  warnings: Warning[]
  fetchedAt: Date | null
  stale: boolean
  dropped: number
}

export interface WarningsResponse {
  warnings: WarningWire[]
  fetchedAt: string | null
  stale: boolean
  dropped: number
}

let cache: { warnings: Warning[]; fetchedAt: Date; dropped: number } | null = null

export function __resetFeedCacheForTests(): void {
  cache = null
}

export async function getFeed(): Promise<FeedSnapshot> {
  const now = Date.now()

  if (cache && now - cache.fetchedAt.getTime() < CACHE_MS) {
    return { ...cache, stale: false }
  }

  try {
    const response = await fetch(FEED_URL, {
      headers: { accept: 'application/json' },
      cache: 'no-store',
    })
    if (!response.ok) throw new Error(`RFS feed responded ${response.status}`)

    const { warnings, dropped } = normalizeFeed(await response.json())
    cache = { warnings, dropped, fetchedAt: new Date(now) }
    return { warnings, dropped, fetchedAt: cache.fetchedAt, stale: false }
  } catch {
    // Never propagate. A stale warning beats no warning during a bushfire.
    if (cache) return { ...cache, stale: true }
    return { warnings: [], dropped: 0, fetchedAt: null, stale: true }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test -- lib/rfs/fetch.test.ts
```

Expected: all passing.

- [ ] **Step 5: Implement the route**

`app/api/warnings/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { getFeed, type WarningsResponse } from '@/lib/rfs/fetch'
import { toWire } from '@/lib/domain/warning'

export const dynamic = 'force-dynamic'

/**
 * Takes no parameters by design. The browser decides which warnings are
 * relevant, so no user location or profile data ever reaches the server.
 * Always responds 200 so the client always has something to render.
 */
export async function GET() {
  const snapshot = await getFeed()

  const body: WarningsResponse = {
    warnings: snapshot.warnings.map(toWire),
    fetchedAt: snapshot.fetchedAt ? snapshot.fetchedAt.toISOString() : null,
    stale: snapshot.stale,
    dropped: snapshot.dropped,
  }

  return NextResponse.json(body, {
    headers: { 'cache-control': 'no-store' },
  })
}
```

- [ ] **Step 6: Verify the route against the real feed**

```bash
npm run dev
```

In another terminal:

```bash
curl -s http://localhost:3000/api/warnings | head -c 400
```

Expected: JSON with a `warnings` array, a `fetchedAt` ISO timestamp, and `stale: false`. Stop the server afterwards.

- [ ] **Step 7: Commit**

```bash
git add lib/rfs/fetch.ts lib/rfs/fetch.test.ts app/api/warnings/route.ts
git commit -m "Add feed fetch with cache, stale fallback, and warnings route"
```

---

### Task 7: Geographic primitives

**Files:**
- Create: `lib/domain/geo.ts`
- Test: `lib/domain/geo.test.ts`

**Interfaces:**
- Consumes: `LatLon`, `PolygonRing` (Task 4)
- Produces:
  - `haversineKm(a: LatLon, b: LatLon): number`
  - `pointInRing(point: LatLon, ring: PolygonRing): boolean`
  - `pointInAnyPolygon(point: LatLon, polygons: PolygonRing[]): boolean`

- [ ] **Step 1: Write the failing test**

`lib/domain/geo.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { haversineKm, pointInRing, pointInAnyPolygon } from './geo'

describe('haversineKm', () => {
  it('returns zero for the same point', () => {
    expect(haversineKm({ lat: -33.87, lon: 151.21 }, { lat: -33.87, lon: 151.21 })).toBe(0)
  })

  it('measures one degree of longitude at the equator as about 111km', () => {
    const km = haversineKm({ lat: 0, lon: 0 }, { lat: 0, lon: 1 })
    expect(km).toBeGreaterThan(111.1)
    expect(km).toBeLessThan(111.3)
  })

  it('measures Sydney to Katoomba as roughly 80km', () => {
    const km = haversineKm({ lat: -33.8688, lon: 151.2093 }, { lat: -33.7128, lon: 150.3119 })
    expect(km).toBeGreaterThan(75)
    expect(km).toBeLessThan(90)
  })

  it('is symmetric', () => {
    const a = { lat: -33.8, lon: 151.2 }
    const b = { lat: -32.9, lon: 151.8 }
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 9)
  })
})

const square: { lat: number; lon: number }[] = [
  { lat: -34, lon: 150 },
  { lat: -34, lon: 151 },
  { lat: -33, lon: 151 },
  { lat: -33, lon: 150 },
  { lat: -34, lon: 150 },
]

describe('pointInRing', () => {
  it('finds a point inside the ring', () => {
    expect(pointInRing({ lat: -33.5, lon: 150.5 }, square)).toBe(true)
  })

  it('rejects a point outside the ring', () => {
    expect(pointInRing({ lat: -35, lon: 150.5 }, square)).toBe(false)
    expect(pointInRing({ lat: -33.5, lon: 152 }, square)).toBe(false)
  })

  it('returns false for a degenerate ring instead of throwing', () => {
    expect(pointInRing({ lat: -33.5, lon: 150.5 }, [])).toBe(false)
    expect(pointInRing({ lat: -33.5, lon: 150.5 }, [{ lat: -33, lon: 150 }])).toBe(false)
  })
})

describe('pointInAnyPolygon', () => {
  it('is true when the point falls inside any one polygon', () => {
    expect(pointInAnyPolygon({ lat: -33.5, lon: 150.5 }, [[], square])).toBe(true)
  })

  it('is false when there are no polygons', () => {
    expect(pointInAnyPolygon({ lat: -33.5, lon: 150.5 }, [])).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- lib/domain/geo.test.ts
```

Expected: FAIL, cannot resolve `./geo`.

- [ ] **Step 3: Implement**

`lib/domain/geo.ts`:

```ts
import type { LatLon, PolygonRing } from './warning'

const EARTH_RADIUS_KM = 6371.0088

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180

export function haversineKm(a: LatLon, b: LatLon): number {
  const dLat = toRadians(b.lat - a.lat)
  const dLon = toRadians(b.lon - a.lon)
  const lat1 = toRadians(a.lat)
  const lat2 = toRadians(b.lat)

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

/**
 * Ray casting in lon/lat space. Fire polygons span a few kilometres, so
 * treating degrees as a flat plane is accurate enough and avoids a
 * projection step.
 */
export function pointInRing(point: LatLon, ring: PolygonRing): boolean {
  if (ring.length < 3) return false

  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const yi = ring[i].lat
    const xi = ring[i].lon
    const yj = ring[j].lat
    const xj = ring[j].lon

    const straddles = yi > point.lat !== yj > point.lat
    if (!straddles) continue

    const crossingLon = ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi
    if (point.lon < crossingLon) inside = !inside
  }
  return inside
}

export function pointInAnyPolygon(point: LatLon, polygons: PolygonRing[]): boolean {
  return polygons.some((ring) => pointInRing(point, ring))
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test -- lib/domain/geo.test.ts
```

Expected: all passing.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/geo.ts lib/domain/geo.test.ts
git commit -m "Add haversine distance and point-in-polygon"
```

---

### Task 8: Relevance matching

When the user's location is unknown, every surfaceable warning is returned rather than none. Showing a statewide list is a worse experience than a personalised one, but showing nothing during a bushfire is unacceptable.

**Files:**
- Create: `lib/domain/match.ts`
- Test: `lib/domain/match.test.ts`

**Interfaces:**
- Consumes: `Warning`, `AlertLevel`, `LatLon`, `SEVERITY`, `isSurfaceable` (Task 4); `haversineKm`, `pointInAnyPolygon` (Task 7)
- Produces:
  - `type Band = 'inside' | 'very-close' | 'close' | 'nearby' | 'unknown'`
  - `SURFACE_RADIUS_KM: Record<AlertLevel, number>`
  - `interface RelevantWarning { warning: Warning; distanceKm: number | null; inside: boolean; band: Band }`
  - `matchWarnings(warnings: Warning[], at: LatLon | null): RelevantWarning[]`

- [ ] **Step 1: Write the failing test**

`lib/domain/match.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { matchWarnings, SURFACE_RADIUS_KM } from './match'
import type { AlertLevel, Warning } from './warning'

const KATOOMBA = { lat: -33.7128, lon: 150.3119 }

function warning(overrides: Partial<Warning> & { id: string; level: AlertLevel }): Warning {
  return {
    title: 'Test fire',
    location: 'Test location',
    council: 'Blue Mountains',
    status: 'Out of control',
    type: 'Bush Fire',
    sizeHa: 10,
    agency: 'Rural Fire Service',
    updatedAt: new Date('2026-08-29T04:12:00.000Z'),
    publishedAt: new Date('2026-08-29T04:12:00.000Z'),
    point: KATOOMBA,
    polygons: [],
    officialUrl: 'https://example.invalid',
    rawAdvice: null,
    ...overrides,
  }
}

/** Roughly 1km of latitude per 0.009 degrees. */
function kmNorth(from: { lat: number; lon: number }, km: number) {
  return { lat: from.lat + km * 0.009, lon: from.lon }
}

describe('matchWarnings', () => {
  it('never surfaces not-applicable incidents', () => {
    const result = matchWarnings([warning({ id: 'a', level: 'not-applicable' })], KATOOMBA)
    expect(result).toHaveLength(0)
  })

  it('sorts by severity before distance', () => {
    const result = matchWarnings(
      [
        warning({ id: 'near-advice', level: 'advice', point: kmNorth(KATOOMBA, 1) }),
        warning({ id: 'far-emergency', level: 'emergency-warning', point: kmNorth(KATOOMBA, 40) }),
      ],
      KATOOMBA,
    )
    expect(result.map((r) => r.warning.id)).toEqual(['far-emergency', 'near-advice'])
  })

  it('sorts by distance within the same severity', () => {
    const result = matchWarnings(
      [
        warning({ id: 'further', level: 'advice', point: kmNorth(KATOOMBA, 10) }),
        warning({ id: 'closer', level: 'advice', point: kmNorth(KATOOMBA, 2) }),
      ],
      KATOOMBA,
    )
    expect(result.map((r) => r.warning.id)).toEqual(['closer', 'further'])
  })

  it('applies the per-level surface radius', () => {
    // Advice surfaces within 20km, so one at 40km is dropped.
    const result = matchWarnings(
      [warning({ id: 'distant-advice', level: 'advice', point: kmNorth(KATOOMBA, 40) })],
      KATOOMBA,
    )
    expect(result).toHaveLength(0)
  })

  it('keeps a distant emergency warning that a distant advice would lose', () => {
    const result = matchWarnings(
      [warning({ id: 'distant-emergency', level: 'emergency-warning', point: kmNorth(KATOOMBA, 40) })],
      KATOOMBA,
    )
    expect(result).toHaveLength(1)
  })

  it('marks the user as inside when a polygon contains them', () => {
    const result = matchWarnings(
      [
        warning({
          id: 'surrounding',
          level: 'watch-and-act',
          point: kmNorth(KATOOMBA, 200),
          polygons: [[
            { lat: -34, lon: 150 },
            { lat: -34, lon: 151 },
            { lat: -33, lon: 151 },
            { lat: -33, lon: 150 },
          ]],
        }),
      ],
      KATOOMBA,
    )
    expect(result[0].inside).toBe(true)
    expect(result[0].band).toBe('inside')
  })

  it('bands by distance when there is no polygon', () => {
    const bandFor = (km: number) =>
      matchWarnings(
        [warning({ id: 'x', level: 'emergency-warning', point: kmNorth(KATOOMBA, km) })],
        KATOOMBA,
      )[0].band
    expect(bandFor(2)).toBe('very-close')
    expect(bandFor(10)).toBe('close')
    expect(bandFor(40)).toBe('nearby')
  })

  it('returns every surfaceable warning when the location is unknown', () => {
    const result = matchWarnings(
      [
        warning({ id: 'a', level: 'advice' }),
        warning({ id: 'b', level: 'not-applicable' }),
      ],
      null,
    )
    expect(result).toHaveLength(1)
    expect(result[0].distanceKm).toBeNull()
    expect(result[0].band).toBe('unknown')
  })

  it('keeps a warning with no coordinates rather than silently dropping it', () => {
    const result = matchWarnings(
      [warning({ id: 'no-geo', level: 'watch-and-act', point: null })],
      KATOOMBA,
    )
    expect(result).toHaveLength(1)
    expect(result[0].band).toBe('unknown')
  })
})

describe('SURFACE_RADIUS_KM', () => {
  it('matches the radii in the spec', () => {
    expect(SURFACE_RADIUS_KM['emergency-warning']).toBe(50)
    expect(SURFACE_RADIUS_KM['watch-and-act']).toBe(30)
    expect(SURFACE_RADIUS_KM.advice).toBe(20)
    expect(SURFACE_RADIUS_KM['planned-burn']).toBe(10)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- lib/domain/match.test.ts
```

Expected: FAIL, cannot resolve `./match`.

- [ ] **Step 3: Implement**

`lib/domain/match.ts`:

```ts
import { haversineKm, pointInAnyPolygon } from './geo'
import { SEVERITY, isSurfaceable, type AlertLevel, type LatLon, type Warning } from './warning'

export type Band = 'inside' | 'very-close' | 'close' | 'nearby' | 'unknown'

/** A distant emergency warning still matters; a distant planned burn does not. */
export const SURFACE_RADIUS_KM: Record<AlertLevel, number> = {
  'emergency-warning': 50,
  'watch-and-act': 30,
  advice: 20,
  'planned-burn': 10,
  'not-applicable': 0,
}

export interface RelevantWarning {
  warning: Warning
  distanceKm: number | null
  inside: boolean
  band: Band
}

function bandFor(distanceKm: number): Band {
  if (distanceKm < 5) return 'very-close'
  if (distanceKm < 15) return 'close'
  return 'nearby'
}

export function matchWarnings(warnings: Warning[], at: LatLon | null): RelevantWarning[] {
  const relevant: RelevantWarning[] = []

  for (const warning of warnings) {
    if (!isSurfaceable(warning.level)) continue

    // Without a location we cannot rank by proximity, so we show everything
    // surfaceable rather than nothing.
    if (!at || !warning.point) {
      relevant.push({ warning, distanceKm: null, inside: false, band: 'unknown' })
      continue
    }

    const inside = pointInAnyPolygon(at, warning.polygons)
    const distanceKm = haversineKm(at, warning.point)

    if (!inside && distanceKm > SURFACE_RADIUS_KM[warning.level]) continue

    relevant.push({
      warning,
      distanceKm,
      inside,
      band: inside ? 'inside' : bandFor(distanceKm),
    })
  }

  return relevant.sort((a, b) => {
    const bySeverity = SEVERITY[b.warning.level] - SEVERITY[a.warning.level]
    if (bySeverity !== 0) return bySeverity
    if (a.inside !== b.inside) return a.inside ? -1 : 1
    if (a.distanceKm === null) return b.distanceKm === null ? 0 : 1
    if (b.distanceKm === null) return -1
    return a.distanceKm - b.distanceKm
  })
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test -- lib/domain/match.test.ts
```

Expected: all passing.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/match.ts lib/domain/match.test.ts
git commit -m "Add profile-independent relevance matching and banding"
```

---

### Task 9: User profile and NSW place lookup

`loadProfile` takes an optional `Storage` so it can be tested without a DOM. It merges over defaults rather than trusting stored shape, so an old or corrupt profile from a previous build cannot crash the app.

**Files:**
- Create: `lib/domain/profile.ts`, `lib/locations/nsw.ts`
- Test: `lib/domain/profile.test.ts`, `lib/locations/nsw.test.ts`

**Interfaces:**
- Consumes: `LatLon` (Task 4)
- Produces:
  - `type LanguageCode = 'en' | 'zh' | 'hi' | 'vi'`
  - `type Mobility = 'none' | 'limited-walking' | 'wheelchair' | 'bedbound'`
  - `type Transport = 'own-car' | 'can-get-lift' | 'no-transport'`
  - `interface UserProfile`, `DEFAULT_PROFILE`, `PROFILE_STORAGE_KEY`
  - `loadProfile(storage?: Storage | null): UserProfile`
  - `saveProfile(profile: UserProfile, storage?: Storage | null): void`
  - `interface NswPlace { label: string; postcode: string; lat: number; lon: number }`
  - `NSW_PLACES`, `DEFAULT_DEMO_PLACE`, `searchPlaces(query: string, limit?: number): NswPlace[]`

- [ ] **Step 1: Write the failing tests**

`lib/domain/profile.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { loadProfile, saveProfile, DEFAULT_PROFILE, PROFILE_STORAGE_KEY } from './profile'

function fakeStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial))
  return {
    get length() { return data.size },
    clear: () => data.clear(),
    getItem: (k: string) => data.get(k) ?? null,
    key: (i: number) => Array.from(data.keys())[i] ?? null,
    removeItem: (k: string) => { data.delete(k) },
    setItem: (k: string, v: string) => { data.set(k, v) },
  } as Storage
}

describe('loadProfile', () => {
  it('returns defaults when nothing is stored', () => {
    expect(loadProfile(fakeStorage())).toEqual(DEFAULT_PROFILE)
  })

  it('returns defaults when storage is unavailable', () => {
    expect(loadProfile(null)).toEqual(DEFAULT_PROFILE)
  })

  it('returns defaults rather than throwing on corrupt JSON', () => {
    const storage = fakeStorage({ [PROFILE_STORAGE_KEY]: 'not json {{{' })
    expect(loadProfile(storage)).toEqual(DEFAULT_PROFILE)
  })

  it('merges a partial stored profile over the defaults', () => {
    const storage = fakeStorage({
      [PROFILE_STORAGE_KEY]: JSON.stringify({ language: 'zh', largeText: true }),
    })
    const profile = loadProfile(storage)
    expect(profile.language).toBe('zh')
    expect(profile.largeText).toBe(true)
    expect(profile.transport).toBe(DEFAULT_PROFILE.transport)
  })

  it('rejects a stored language that is no longer supported', () => {
    const storage = fakeStorage({ [PROFILE_STORAGE_KEY]: JSON.stringify({ language: 'ar' }) })
    expect(loadProfile(storage).language).toBe('en')
  })

  it('round-trips a saved profile', () => {
    const storage = fakeStorage()
    const profile = {
      ...DEFAULT_PROFILE,
      language: 'vi' as const,
      mobility: 'wheelchair' as const,
      transport: 'no-transport' as const,
      location: { lat: -33.7128, lon: 150.3119, label: 'Katoomba' },
      completedSetup: true,
    }
    saveProfile(profile, storage)
    expect(loadProfile(storage)).toEqual(profile)
  })

  it('does not throw when saving with storage unavailable', () => {
    expect(() => saveProfile(DEFAULT_PROFILE, null)).not.toThrow()
  })
})
```

`lib/locations/nsw.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { NSW_PLACES, DEFAULT_DEMO_PLACE, searchPlaces } from './nsw'

describe('NSW_PLACES', () => {
  it('has plausible NSW coordinates for every entry', () => {
    for (const place of NSW_PLACES) {
      expect(place.lat).toBeGreaterThan(-38)
      expect(place.lat).toBeLessThan(-27)
      expect(place.lon).toBeGreaterThan(140)
      expect(place.lon).toBeLessThan(154)
    }
  })

  it('has no duplicate labels', () => {
    const labels = NSW_PLACES.map((p) => p.label)
    expect(new Set(labels).size).toBe(labels.length)
  })
})

describe('DEFAULT_DEMO_PLACE', () => {
  it('is a Blue Mountains location, per the spec', () => {
    expect(DEFAULT_DEMO_PLACE.label).toBe('Katoomba')
  })
})

describe('searchPlaces', () => {
  it('matches on partial name, case-insensitively', () => {
    expect(searchPlaces('katoo').map((p) => p.label)).toContain('Katoomba')
    expect(searchPlaces('KATOO').map((p) => p.label)).toContain('Katoomba')
  })

  it('matches on postcode', () => {
    expect(searchPlaces('2780').map((p) => p.label)).toContain('Katoomba')
  })

  it('returns nothing for a blank query', () => {
    expect(searchPlaces('')).toEqual([])
    expect(searchPlaces('   ')).toEqual([])
  })

  it('respects the limit', () => {
    expect(searchPlaces('a', 3).length).toBeLessThanOrEqual(3)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm test -- lib/domain/profile.test.ts lib/locations/nsw.test.ts
```

Expected: FAIL, cannot resolve the modules.

- [ ] **Step 3: Implement the profile**

`lib/domain/profile.ts`:

```ts
export type LanguageCode = 'en' | 'zh' | 'hi' | 'vi'
export type Mobility = 'none' | 'limited-walking' | 'wheelchair' | 'bedbound'
export type Transport = 'own-car' | 'can-get-lift' | 'no-transport'

export const LANGUAGE_CODES: readonly LanguageCode[] = ['en', 'zh', 'hi', 'vi'] as const
const MOBILITIES: readonly Mobility[] = ['none', 'limited-walking', 'wheelchair', 'bedbound'] as const
const TRANSPORTS: readonly Transport[] = ['own-car', 'can-get-lift', 'no-transport'] as const

export interface UserProfile {
  location: { lat: number; lon: number; label: string } | null
  language: LanguageCode
  mobility: Mobility
  transport: Transport
  largeText: boolean
  audio: boolean
  completedSetup: boolean
}

export const PROFILE_STORAGE_KEY = 'safesignal.profile.v1'

export const DEFAULT_PROFILE: UserProfile = {
  location: null,
  language: 'en',
  mobility: 'none',
  transport: 'own-car',
  largeText: false,
  audio: false,
  completedSetup: false,
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback
}

function readLocation(value: unknown): UserProfile['location'] {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  if (typeof v.lat !== 'number' || typeof v.lon !== 'number') return null
  return { lat: v.lat, lon: v.lon, label: typeof v.label === 'string' ? v.label : '' }
}

function defaultStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

/**
 * Merges over defaults rather than trusting the stored shape. A profile
 * written by an older build must never be able to crash the app.
 */
export function loadProfile(storage: Storage | null = defaultStorage()): UserProfile {
  if (!storage) return { ...DEFAULT_PROFILE }

  let raw: unknown
  try {
    const stored = storage.getItem(PROFILE_STORAGE_KEY)
    if (!stored) return { ...DEFAULT_PROFILE }
    raw = JSON.parse(stored)
  } catch {
    return { ...DEFAULT_PROFILE }
  }

  if (!raw || typeof raw !== 'object') return { ...DEFAULT_PROFILE }
  const v = raw as Record<string, unknown>

  return {
    location: readLocation(v.location),
    language: oneOf(v.language, LANGUAGE_CODES, DEFAULT_PROFILE.language),
    mobility: oneOf(v.mobility, MOBILITIES, DEFAULT_PROFILE.mobility),
    transport: oneOf(v.transport, TRANSPORTS, DEFAULT_PROFILE.transport),
    largeText: typeof v.largeText === 'boolean' ? v.largeText : DEFAULT_PROFILE.largeText,
    audio: typeof v.audio === 'boolean' ? v.audio : DEFAULT_PROFILE.audio,
    completedSetup: typeof v.completedSetup === 'boolean' ? v.completedSetup : false,
  }
}

export function saveProfile(
  profile: UserProfile,
  storage: Storage | null = defaultStorage(),
): void {
  if (!storage) return
  try {
    storage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile))
  } catch {
    // Private browsing and full quotas both throw. Losing preferences is
    // survivable; crashing during a bushfire is not.
  }
}
```

- [ ] **Step 4: Implement the NSW place list**

`lib/locations/nsw.ts`:

```ts
export interface NswPlace {
  label: string
  postcode: string
  lat: number
  lon: number
}

/**
 * A curated list rather than a geocoding API: no key, no network, and it
 * works offline, which is the point.
 */
export const NSW_PLACES: NswPlace[] = [
  { label: 'Sydney', postcode: '2000', lat: -33.8688, lon: 151.2093 },
  { label: 'Parramatta', postcode: '2150', lat: -33.815, lon: 151.0 },
  { label: 'Blacktown', postcode: '2148', lat: -33.771, lon: 150.906 },
  { label: 'Liverpool', postcode: '2170', lat: -33.9203, lon: 150.9235 },
  { label: 'Campbelltown', postcode: '2560', lat: -34.065, lon: 150.8142 },
  { label: 'Camden', postcode: '2570', lat: -34.0548, lon: 150.6963 },
  { label: 'Penrith', postcode: '2750', lat: -33.7507, lon: 150.6877 },
  { label: 'Richmond', postcode: '2753', lat: -33.5996, lon: 150.7511 },
  { label: 'Springwood', postcode: '2777', lat: -33.6989, lon: 150.5619 },
  { label: 'Katoomba', postcode: '2780', lat: -33.7128, lon: 150.3119 },
  { label: 'Lithgow', postcode: '2790', lat: -33.4818, lon: 150.1553 },
  { label: 'Hornsby', postcode: '2077', lat: -33.7048, lon: 151.0993 },
  { label: 'Manly', postcode: '2095', lat: -33.7969, lon: 151.287 },
  { label: 'Cronulla', postcode: '2230', lat: -34.0587, lon: 151.1526 },
  { label: 'Gosford', postcode: '2250', lat: -33.4269, lon: 151.3428 },
  { label: 'Newcastle', postcode: '2300', lat: -32.9283, lon: 151.7817 },
  { label: 'Maitland', postcode: '2320', lat: -32.7333, lon: 151.55 },
  { label: 'Cessnock', postcode: '2325', lat: -32.8347, lon: 151.3567 },
  { label: 'Singleton', postcode: '2330', lat: -32.5667, lon: 151.17 },
  { label: 'Muswellbrook', postcode: '2333', lat: -32.265, lon: 150.889 },
  { label: 'Nelson Bay', postcode: '2315', lat: -32.72, lon: 152.15 },
  { label: 'Forster', postcode: '2428', lat: -32.18, lon: 152.51 },
  { label: 'Taree', postcode: '2430', lat: -31.9074, lon: 152.46 },
  { label: 'Port Macquarie', postcode: '2444', lat: -31.4333, lon: 152.9089 },
  { label: 'Kempsey', postcode: '2440', lat: -31.08, lon: 152.84 },
  { label: 'Coffs Harbour', postcode: '2450', lat: -30.2963, lon: 153.1135 },
  { label: 'Grafton', postcode: '2460', lat: -29.69, lon: 152.9333 },
  { label: 'Casino', postcode: '2470', lat: -28.86, lon: 153.05 },
  { label: 'Lismore', postcode: '2480', lat: -28.8134, lon: 153.2773 },
  { label: 'Ballina', postcode: '2478', lat: -28.8639, lon: 153.5652 },
  { label: 'Byron Bay', postcode: '2481', lat: -28.6474, lon: 153.602 },
  { label: 'Tweed Heads', postcode: '2485', lat: -28.1747, lon: 153.5392 },
  { label: 'Armidale', postcode: '2350', lat: -30.515, lon: 151.6655 },
  { label: 'Tamworth', postcode: '2340', lat: -31.0927, lon: 150.932 },
  { label: 'Inverell', postcode: '2360', lat: -29.7756, lon: 151.112 },
  { label: 'Glen Innes', postcode: '2370', lat: -29.735, lon: 151.74 },
  { label: 'Moree', postcode: '2400', lat: -29.4658, lon: 149.8416 },
  { label: 'Narrabri', postcode: '2390', lat: -30.326, lon: 149.783 },
  { label: 'Dubbo', postcode: '2830', lat: -32.2569, lon: 148.6011 },
  { label: 'Mudgee', postcode: '2850', lat: -32.5942, lon: 149.5872 },
  { label: 'Orange', postcode: '2800', lat: -33.2835, lon: 149.1012 },
  { label: 'Bathurst', postcode: '2795', lat: -33.4193, lon: 149.5775 },
  { label: 'Cowra', postcode: '2794', lat: -33.836, lon: 148.694 },
  { label: 'Young', postcode: '2594', lat: -34.313, lon: 148.3 },
  { label: 'Goulburn', postcode: '2580', lat: -34.7515, lon: 149.7186 },
  { label: 'Queanbeyan', postcode: '2620', lat: -35.355, lon: 149.232 },
  { label: 'Wollongong', postcode: '2500', lat: -34.4278, lon: 150.8931 },
  { label: 'Nowra', postcode: '2541', lat: -34.8846, lon: 150.6006 },
  { label: 'Batemans Bay', postcode: '2536', lat: -35.7076, lon: 150.1744 },
  { label: 'Bega', postcode: '2550', lat: -36.6742, lon: 149.8419 },
  { label: 'Wagga Wagga', postcode: '2650', lat: -35.1082, lon: 147.3598 },
  { label: 'Albury', postcode: '2640', lat: -36.0737, lon: 146.9135 },
  { label: 'Griffith', postcode: '2680', lat: -34.29, lon: 146.04 },
  { label: 'Deniliquin', postcode: '2710', lat: -35.532, lon: 144.953 },
  { label: 'Broken Hill', postcode: '2880', lat: -31.9539, lon: 141.4539 },
]

/** Blue Mountains anchor for demo mode on a device with no profile. */
export const DEFAULT_DEMO_PLACE: NswPlace =
  NSW_PLACES.find((p) => p.label === 'Katoomba')!

export function searchPlaces(query: string, limit = 8): NswPlace[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return []

  return NSW_PLACES.filter(
    (place) =>
      place.label.toLowerCase().includes(needle) || place.postcode.startsWith(needle),
  ).slice(0, limit)
}
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npm test -- lib/domain/profile.test.ts lib/locations/nsw.test.ts
```

Expected: all passing.

- [ ] **Step 6: Commit**

```bash
git add lib/domain/profile.ts lib/domain/profile.test.ts lib/locations/nsw.ts lib/locations/nsw.test.ts
git commit -m "Add user profile storage and NSW place lookup"
```

---

### Task 10: The WarningSource seam and LiveSource

**Files:**
- Create: `lib/sources/types.ts`, `lib/sources/live.ts`
- Test: `lib/sources/live.test.ts`

**Interfaces:**
- Consumes: `Warning`, `WarningWire`, `fromWire` (Task 4); `WarningsResponse` (Task 6)
- Produces:
  - `interface WarningFeed { warnings: Warning[]; fetchedAt: Date | null; stale: boolean }`
  - `interface WarningSource { subscribe(onFeed: (feed: WarningFeed) => void): () => void }`
  - `class LiveSource implements WarningSource` with `constructor(pollMs?: number)`

- [ ] **Step 1: Write the failing test**

`lib/sources/live.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { LiveSource } from './live'
import type { WarningFeed } from './types'

const response = {
  warnings: [
    {
      id: 'incident-1',
      level: 'advice',
      title: 'TEST FIRE',
      location: 'Somewhere',
      council: 'Blue Mountains',
      status: 'Under control',
      type: 'Bush Fire',
      sizeHa: 5,
      agency: 'Rural Fire Service',
      updatedAt: '2026-08-29T04:12:00.000Z',
      publishedAt: '2026-08-29T04:12:00.000Z',
      point: { lat: -33.71, lon: 150.31 },
      polygons: [],
      officialUrl: 'https://example.invalid',
      rawAdvice: null,
    },
  ],
  fetchedAt: '2026-08-29T12:00:00.000Z',
  stale: false,
  dropped: 0,
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('LiveSource', () => {
  it('emits a feed with revived Date objects on first poll', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => response }))
    const received: WarningFeed[] = []
    const source = new LiveSource(60_000)
    const unsubscribe = source.subscribe((feed) => received.push(feed))

    await vi.advanceTimersByTimeAsync(0)

    expect(received).toHaveLength(1)
    expect(received[0].warnings[0].updatedAt).toBeInstanceOf(Date)
    expect(received[0].stale).toBe(false)
    unsubscribe()
  })

  it('polls again after the interval', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => response })
    vi.stubGlobal('fetch', fetchMock)
    const source = new LiveSource(60_000)
    const unsubscribe = source.subscribe(() => {})

    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(60_000)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    unsubscribe()
  })

  it('stops polling once unsubscribed', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => response })
    vi.stubGlobal('fetch', fetchMock)
    const source = new LiveSource(60_000)
    const unsubscribe = source.subscribe(() => {})

    await vi.advanceTimersByTimeAsync(0)
    unsubscribe()
    await vi.advanceTimersByTimeAsync(180_000)

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('re-emits the last good feed marked stale when a poll fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => response })
      .mockRejectedValueOnce(new Error('offline'))
    vi.stubGlobal('fetch', fetchMock)

    const received: WarningFeed[] = []
    const source = new LiveSource(60_000)
    const unsubscribe = source.subscribe((feed) => received.push(feed))

    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(60_000)

    expect(received).toHaveLength(2)
    expect(received[1].warnings).toHaveLength(1)
    expect(received[1].stale).toBe(true)
    unsubscribe()
  })

  it('emits an empty stale feed when the very first poll fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    const received: WarningFeed[] = []
    const source = new LiveSource(60_000)
    const unsubscribe = source.subscribe((feed) => received.push(feed))

    await vi.advanceTimersByTimeAsync(0)

    expect(received[0].warnings).toEqual([])
    expect(received[0].stale).toBe(true)
    unsubscribe()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- lib/sources/live.test.ts
```

Expected: FAIL, cannot resolve `./live`.

- [ ] **Step 3: Implement the interface**

`lib/sources/types.ts`:

```ts
import type { Warning } from '@/lib/domain/warning'

export interface WarningFeed {
  warnings: Warning[]
  fetchedAt: Date | null
  stale: boolean
}

/**
 * The single seam the whole application depends on. Live and demo mode are
 * two implementations, so demo mode exercises the real app rather than a
 * parallel fake.
 */
export interface WarningSource {
  subscribe(onFeed: (feed: WarningFeed) => void): () => void
}
```

- [ ] **Step 4: Implement LiveSource**

`lib/sources/live.ts`:

```ts
import { fromWire, type Warning, type WarningWire } from '@/lib/domain/warning'
import type { WarningFeed, WarningSource } from './types'

const DEFAULT_POLL_MS = 60_000

interface WarningsResponseBody {
  warnings: WarningWire[]
  fetchedAt: string | null
  stale: boolean
}

export class LiveSource implements WarningSource {
  private lastGood: { warnings: Warning[]; fetchedAt: Date | null } | null = null

  constructor(private readonly pollMs: number = DEFAULT_POLL_MS) {}

  subscribe(onFeed: (feed: WarningFeed) => void): () => void {
    let active = true

    const poll = async () => {
      const feed = await this.fetchOnce()
      if (active) onFeed(feed)
    }

    void poll()
    const timer = setInterval(() => void poll(), this.pollMs)

    return () => {
      active = false
      clearInterval(timer)
    }
  }

  private async fetchOnce(): Promise<WarningFeed> {
    try {
      const response = await fetch('/api/warnings', { cache: 'no-store' })
      if (!response.ok) throw new Error(`warnings route responded ${response.status}`)

      const body = (await response.json()) as WarningsResponseBody
      const warnings = body.warnings.map(fromWire)
      const fetchedAt = body.fetchedAt ? new Date(body.fetchedAt) : null

      this.lastGood = { warnings, fetchedAt }
      return { warnings, fetchedAt, stale: body.stale }
    } catch {
      // The device is offline or the route is unreachable. Re-emit what we
      // have, flagged stale, so the screen keeps showing the last warning.
      if (this.lastGood) return { ...this.lastGood, stale: true }
      return { warnings: [], fetchedAt: null, stale: true }
    }
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
npm test -- lib/sources/live.test.ts
```

Expected: all passing.

- [ ] **Step 6: Commit**

```bash
git add lib/sources/types.ts lib/sources/live.ts lib/sources/live.test.ts
git commit -m "Add WarningSource seam and LiveSource polling"
```

---

### Task 11: Demo scenario and DemoSource

The scenario text is modelled on standard RFS wording, but it is invented for a fire that does not exist. Demo mode therefore always renders a simulated-data banner, which Task 18 wires up. That banner is not decoration; it is why it is acceptable for this fixture to read like a real warning.

**Files:**
- Create: `lib/sources/scenario.ts`, `lib/sources/demo.ts`
- Test: `lib/sources/demo.test.ts`

**Interfaces:**
- Consumes: `Warning`, `LatLon` (Task 4); `WarningFeed`, `WarningSource` (Task 10)
- Produces:
  - `interface ScenarioStep { atMs: number; label: string; warnings: Warning[] }`
  - `buildScenario(anchor: LatLon, anchorLabel: string): ScenarioStep[]`
  - `interface DemoState { stepIndex: number; playing: boolean; totalSteps: number }`
  - `class DemoSource implements WarningSource` with `play()`, `pause()`, `restart()`, `seek(index)`, `onStateChange(cb)`, `dispose()`

- [ ] **Step 1: Write the failing test**

`lib/sources/demo.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildScenario } from './scenario'
import { DemoSource, type DemoState } from './demo'
import type { WarningFeed } from './types'

const KATOOMBA = { lat: -33.7128, lon: 150.3119 }

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('buildScenario', () => {
  it('escalates from advice to emergency warning', () => {
    const steps = buildScenario(KATOOMBA, 'Katoomba')
    expect(steps.map((s) => s.warnings[0].level)).toEqual([
      'advice',
      'watch-and-act',
      'emergency-warning',
    ])
  })

  it('moves the fire closer at each step', () => {
    const steps = buildScenario(KATOOMBA, 'Katoomba')
    const latOf = (i: number) => steps[i].warnings[0].point!.lat
    // The anchor is south of every step, so the fire approaching means
    // each step's latitude gets closer to the anchor's.
    const gap = (i: number) => Math.abs(latOf(i) - KATOOMBA.lat)
    expect(gap(1)).toBeLessThan(gap(0))
    expect(gap(2)).toBeLessThan(gap(1))
  })

  it('has strictly increasing timestamps starting at zero', () => {
    const steps = buildScenario(KATOOMBA, 'Katoomba')
    expect(steps[0].atMs).toBe(0)
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i].atMs).toBeGreaterThan(steps[i - 1].atMs)
    }
  })

  it('names the anchor location in the warning text', () => {
    const steps = buildScenario(KATOOMBA, 'Katoomba')
    expect(steps[0].warnings[0].location).toContain('Katoomba')
  })
})

describe('DemoSource', () => {
  it('emits the first step immediately on subscribe', () => {
    const source = new DemoSource(buildScenario(KATOOMBA, 'Katoomba'))
    const received: WarningFeed[] = []
    source.subscribe((feed) => received.push(feed))

    expect(received).toHaveLength(1)
    expect(received[0].warnings[0].level).toBe('advice')
    source.dispose()
  })

  it('advances through the scenario once played', () => {
    const steps = buildScenario(KATOOMBA, 'Katoomba')
    const source = new DemoSource(steps)
    const received: WarningFeed[] = []
    source.subscribe((feed) => received.push(feed))

    source.play()
    vi.advanceTimersByTime(steps[steps.length - 1].atMs + 1000)

    expect(received[received.length - 1].warnings[0].level).toBe('emergency-warning')
    source.dispose()
  })

  it('stops advancing when paused', () => {
    const steps = buildScenario(KATOOMBA, 'Katoomba')
    const source = new DemoSource(steps)
    const received: WarningFeed[] = []
    source.subscribe((feed) => received.push(feed))

    source.play()
    source.pause()
    vi.advanceTimersByTime(600_000)

    expect(received).toHaveLength(1)
    source.dispose()
  })

  it('jumps straight to a step when seeked', () => {
    const source = new DemoSource(buildScenario(KATOOMBA, 'Katoomba'))
    const received: WarningFeed[] = []
    source.subscribe((feed) => received.push(feed))

    source.seek(2)

    expect(received[received.length - 1].warnings[0].level).toBe('emergency-warning')
    source.dispose()
  })

  it('clamps a seek beyond the end instead of throwing', () => {
    const source = new DemoSource(buildScenario(KATOOMBA, 'Katoomba'))
    source.subscribe(() => {})
    expect(() => source.seek(99)).not.toThrow()
    expect(source.state.stepIndex).toBe(2)
    source.dispose()
  })

  it('returns to the first step on restart', () => {
    const source = new DemoSource(buildScenario(KATOOMBA, 'Katoomba'))
    const received: WarningFeed[] = []
    source.subscribe((feed) => received.push(feed))

    source.seek(2)
    source.restart()

    expect(received[received.length - 1].warnings[0].level).toBe('advice')
    expect(source.state.playing).toBe(false)
    source.dispose()
  })

  it('reports state changes to listeners', () => {
    const source = new DemoSource(buildScenario(KATOOMBA, 'Katoomba'))
    const states: DemoState[] = []
    source.onStateChange((s) => states.push(s))

    source.play()
    source.pause()

    expect(states.some((s) => s.playing)).toBe(true)
    expect(states[states.length - 1].playing).toBe(false)
    expect(states[states.length - 1].totalSteps).toBe(3)
    source.dispose()
  })

  it('never marks the demo feed stale', () => {
    const source = new DemoSource(buildScenario(KATOOMBA, 'Katoomba'))
    const received: WarningFeed[] = []
    source.subscribe((feed) => received.push(feed))
    expect(received[0].stale).toBe(false)
    source.dispose()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- lib/sources/demo.test.ts
```

Expected: FAIL, cannot resolve `./scenario`.

- [ ] **Step 3: Implement the scenario**

`lib/sources/scenario.ts`:

```ts
import type { LatLon, Warning } from '@/lib/domain/warning'

export interface ScenarioStep {
  atMs: number
  label: string
  warnings: Warning[]
}

/** Roughly one kilometre of latitude. */
const KM_IN_DEGREES = 0.009

const BASE = new Date('2026-11-14T03:00:00.000Z')
const minutesAfter = (minutes: number) => new Date(BASE.getTime() + minutes * 60_000)

function demoWarning(
  anchor: LatLon,
  anchorLabel: string,
  distanceKm: number,
  fields: Pick<Warning, 'level' | 'status' | 'sizeHa' | 'rawAdvice'>,
  minute: number,
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
    polygons: [],
    officialUrl: 'https://www.rfs.nsw.gov.au/fire-information/fires-near-me',
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
        }, 41),
      ],
    },
  ]
}
```

- [ ] **Step 4: Implement DemoSource**

`lib/sources/demo.ts`:

```ts
import type { ScenarioStep } from './scenario'
import type { WarningFeed, WarningSource } from './types'

export interface DemoState {
  stepIndex: number
  playing: boolean
  totalSteps: number
}

export class DemoSource implements WarningSource {
  private stepIndex = 0
  private playing = false
  private timer: ReturnType<typeof setTimeout> | null = null
  private readonly feedListeners = new Set<(feed: WarningFeed) => void>()
  private readonly stateListeners = new Set<(state: DemoState) => void>()

  constructor(private readonly steps: ScenarioStep[]) {}

  get state(): DemoState {
    return { stepIndex: this.stepIndex, playing: this.playing, totalSteps: this.steps.length }
  }

  subscribe(onFeed: (feed: WarningFeed) => void): () => void {
    this.feedListeners.add(onFeed)
    onFeed(this.currentFeed())
    return () => {
      this.feedListeners.delete(onFeed)
    }
  }

  onStateChange(onState: (state: DemoState) => void): () => void {
    this.stateListeners.add(onState)
    return () => {
      this.stateListeners.delete(onState)
    }
  }

  play(): void {
    if (this.playing) return
    this.playing = true
    this.emitState()
    this.scheduleNext()
  }

  pause(): void {
    this.playing = false
    this.clearTimer()
    this.emitState()
  }

  restart(): void {
    this.pause()
    this.stepIndex = 0
    this.emitFeed()
    this.emitState()
  }

  /** Lets a presenter jump straight to the emergency warning. */
  seek(index: number): void {
    this.clearTimer()
    this.stepIndex = Math.max(0, Math.min(index, this.steps.length - 1))
    this.emitFeed()
    this.emitState()
    if (this.playing) this.scheduleNext()
  }

  dispose(): void {
    this.clearTimer()
    this.feedListeners.clear()
    this.stateListeners.clear()
  }

  private scheduleNext(): void {
    this.clearTimer()
    const next = this.stepIndex + 1
    if (next >= this.steps.length) {
      this.playing = false
      this.emitState()
      return
    }

    const delay = this.steps[next].atMs - this.steps[this.stepIndex].atMs
    this.timer = setTimeout(() => {
      this.stepIndex = next
      this.emitFeed()
      this.emitState()
      this.scheduleNext()
    }, Math.max(0, delay))
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  private currentFeed(): WarningFeed {
    return {
      warnings: this.steps[this.stepIndex]?.warnings ?? [],
      fetchedAt: new Date(),
      stale: false,
    }
  }

  private emitFeed(): void {
    const feed = this.currentFeed()
    for (const listener of this.feedListeners) listener(feed)
  }

  private emitState(): void {
    const state = this.state
    for (const listener of this.stateListeners) listener(state)
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
npm test -- lib/sources/demo.test.ts
```

Expected: all passing.

- [ ] **Step 6: Commit**

```bash
git add lib/sources/scenario.ts lib/sources/demo.ts lib/sources/demo.test.ts
git commit -m "Add scripted demo scenario and DemoSource with presenter controls"
```

---

### Task 12: Phrase packs

The split between `levelName` and `levelMeaning` is the core accessibility idea. `levelName` is the official label, which a newcomer to Australia may not understand. `levelMeaning` is what it actually means for them. Both are always shown.

`statusValues` and `typeValues` are keyed on the lowercased raw RFS string, so lookup is a direct map from feed data.

The completeness test is cheap insurance against the classic demo failure where one language renders `undefined` on stage.

**Translation note for the implementer:** these translations are written to be plain and short rather than literal. Before the demo, have a native speaker read the four `levelMeaning` and `levelAction` strings aloud. Those eight sentences carry the entire product claim, and they are the only strings a judge is likely to check.

**Files:**
- Create: `lib/i18n/types.ts`, `lib/i18n/phrases/en.ts`, `lib/i18n/phrases/zh.ts`, `lib/i18n/phrases/hi.ts`, `lib/i18n/phrases/vi.ts`, `lib/i18n/index.ts`
- Test: `lib/i18n/index.test.ts`

**Interfaces:**
- Consumes: `AlertLevel` (Task 4); `LanguageCode` (Task 9)
- Produces:
  - `type UIKey`, `interface PhrasePack`
  - `PACKS: Record<LanguageCode, PhrasePack>`
  - `getPack(language: LanguageCode): PhrasePack`
  - `SPEECH_LOCALE: Record<LanguageCode, string>`
  - `LANGUAGE_NAMES: Record<LanguageCode, string>` (each language named in itself)

- [ ] **Step 1: Write the failing test**

`lib/i18n/index.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { PACKS, getPack, SPEECH_LOCALE, LANGUAGE_NAMES, UI_KEYS } from './index'
import { LANGUAGE_CODES } from '@/lib/domain/profile'
import { ALERT_LEVELS } from '@/lib/domain/warning'

describe('phrase pack completeness', () => {
  it('has a pack for every supported language', () => {
    for (const code of LANGUAGE_CODES) {
      expect(PACKS[code], `missing pack: ${code}`).toBeDefined()
    }
  })

  it('defines every UI key in every language', () => {
    for (const code of LANGUAGE_CODES) {
      for (const key of UI_KEYS) {
        const value = PACKS[code].ui[key]
        expect(typeof value, `${code}.ui.${key} is not a string`).toBe('string')
        expect(value.length, `${code}.ui.${key} is empty`).toBeGreaterThan(0)
      }
    }
  })

  it('defines a name, meaning, and action for every alert level in every language', () => {
    for (const code of LANGUAGE_CODES) {
      for (const level of ALERT_LEVELS) {
        expect(PACKS[code].levelName[level], `${code}.levelName.${level}`).toBeTruthy()
        expect(PACKS[code].levelMeaning[level], `${code}.levelMeaning.${level}`).toBeTruthy()
        expect(PACKS[code].levelAction[level], `${code}.levelAction.${level}`).toBeTruthy()
      }
    }
  })

  it('defines the same status and type keys in every language', () => {
    const expectedStatus = Object.keys(PACKS.en.statusValues).sort()
    const expectedType = Object.keys(PACKS.en.typeValues).sort()
    for (const code of LANGUAGE_CODES) {
      expect(Object.keys(PACKS[code].statusValues).sort(), code).toEqual(expectedStatus)
      expect(Object.keys(PACKS[code].typeValues).sort(), code).toEqual(expectedType)
    }
  })

  it('defines every field label in every language', () => {
    const expected = Object.keys(PACKS.en.fields).sort()
    for (const code of LANGUAGE_CODES) {
      expect(Object.keys(PACKS[code].fields).sort(), code).toEqual(expected)
    }
  })

  it('does not leave non-English packs identical to English', () => {
    for (const code of LANGUAGE_CODES) {
      if (code === 'en') continue
      expect(PACKS[code].levelMeaning['emergency-warning'], code)
        .not.toBe(PACKS.en.levelMeaning['emergency-warning'])
    }
  })
})

describe('getPack', () => {
  it('returns the requested pack', () => {
    expect(getPack('vi')).toBe(PACKS.vi)
  })
})

describe('locale metadata', () => {
  it('has a BCP 47 speech locale for every language', () => {
    for (const code of LANGUAGE_CODES) {
      expect(SPEECH_LOCALE[code], code).toMatch(/^[a-z]{2}(-[A-Za-z]{2,4})+$/)
    }
  })

  it('names every language in that language', () => {
    for (const code of LANGUAGE_CODES) {
      expect(LANGUAGE_NAMES[code], code).toBeTruthy()
    }
    expect(LANGUAGE_NAMES.zh).not.toBe('Chinese')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- lib/i18n/index.test.ts
```

Expected: FAIL, cannot resolve `./index`.

- [ ] **Step 3: Define the pack shape**

`lib/i18n/types.ts`:

```ts
import type { AlertLevel } from '@/lib/domain/warning'

export const UI_KEYS = [
  'yourArea',
  'noWarningsTitle',
  'noWarningsBody',
  'officialWording',
  'viewOfficial',
  'listen',
  'stopListening',
  'audioUnavailable',
  'getHelp',
  'callNow',
  'dataAsOf',
  'offlineNotice',
  'demoBanner',
  'kmAway',
  'youAreInside',
  'setupTitle',
  'setupIntro',
  'chooseLanguage',
  'whereYouLive',
  'searchPlace',
  'useMyLocation',
  'mobilityQuestion',
  'transportQuestion',
  'largeTextLabel',
  'audioLabel',
  'saveAndContinue',
  'changeSettings',
  'whatToDo',
  'shareSituation',
  'sourceRfs',
  'mobilityNone',
  'mobilityLimited',
  'mobilityWheelchair',
  'mobilityBedbound',
  'transportOwnCar',
  'transportLift',
  'transportNone',
] as const

export type UIKey = (typeof UI_KEYS)[number]

export interface PhrasePack {
  /** The official label. May be unfamiliar to a newcomer. */
  levelName: Record<AlertLevel, string>
  /** What the label actually means for this person. */
  levelMeaning: Record<AlertLevel, string>
  /** What to do about it, in plain words. */
  levelAction: Record<AlertLevel, string>
  /** Keyed on the lowercased raw RFS status string. */
  statusValues: Record<string, string>
  /** Keyed on the lowercased raw RFS type string. */
  typeValues: Record<string, string>
  fields: {
    location: string
    council: string
    status: string
    size: string
    updated: string
    agency: string
  }
  ui: Record<UIKey, string>
}
```

- [ ] **Step 4: Write the English pack**

`lib/i18n/phrases/en.ts`:

```ts
import type { PhrasePack } from '../types'

export const en: PhrasePack = {
  levelName: {
    'emergency-warning': 'Emergency Warning',
    'watch-and-act': 'Watch and Act',
    advice: 'Advice',
    'planned-burn': 'Planned Burn',
    'not-applicable': 'Recorded incident',
  },
  levelMeaning: {
    'emergency-warning': 'You are in danger now.',
    'watch-and-act': 'A fire is close. Get ready to leave now.',
    advice: 'A fire is burning nearby. There is no immediate danger.',
    'planned-burn': 'Firefighters lit this fire on purpose. You may see smoke.',
    'not-applicable': 'This is a recorded incident, not a warning.',
  },
  levelAction: {
    'emergency-warning': 'Do not wait. Follow the official advice below now.',
    'watch-and-act': 'Get ready to leave. Do not wait for another warning.',
    advice: 'Keep checking for updates.',
    'planned-burn': 'You do not need to do anything. Close your windows if there is smoke.',
    'not-applicable': 'You do not need to do anything.',
  },
  statusValues: {
    'out of control': 'The fire is not under control.',
    'being controlled': 'Firefighters are getting the fire under control.',
    'under control': 'The fire is under control.',
  },
  typeValues: {
    'bush fire': 'Bush fire',
    'grass fire': 'Grass fire',
    'structure fire': 'Building fire',
  },
  fields: {
    location: 'Place',
    council: 'Council area',
    status: 'Status',
    size: 'Fire size',
    updated: 'Updated',
    agency: 'Responsible agency',
  },
  ui: {
    yourArea: 'Your area',
    noWarningsTitle: 'There are no warnings near you right now',
    noWarningsBody: 'We keep checking the official information. If something changes, it will appear here.',
    officialWording: 'Official wording (English)',
    viewOfficial: 'View the official page',
    listen: 'Listen',
    stopListening: 'Stop',
    audioUnavailable: 'This device cannot read this language aloud.',
    getHelp: 'Get help',
    callNow: 'Call now',
    dataAsOf: 'Information as at',
    offlineNotice: 'You are offline. This is the last information we received.',
    demoBanner: 'Demo mode: this is simulated data, not a real warning.',
    kmAway: 'km away',
    youAreInside: 'You are inside the fire area',
    setupTitle: 'Set up SafeSignal',
    setupIntro: 'Answer a few questions so we can show you the right information.',
    chooseLanguage: 'Choose your language',
    whereYouLive: 'Where do you live?',
    searchPlace: 'Type a town name or postcode',
    useMyLocation: 'Use my current location',
    mobilityQuestion: 'Can you move around easily?',
    transportQuestion: 'If you had to leave, do you have a way to travel?',
    largeTextLabel: 'Large text',
    audioLabel: 'Read warnings aloud automatically',
    saveAndContinue: 'Save and continue',
    changeSettings: 'Change settings',
    whatToDo: 'What you should do now',
    shareSituation: 'Send my situation to someone',
    sourceRfs: 'Source: NSW Rural Fire Service',
    mobilityNone: 'I can walk on my own',
    mobilityLimited: 'I have difficulty walking',
    mobilityWheelchair: 'I use a wheelchair',
    mobilityBedbound: 'I am in bed and need help',
    transportOwnCar: 'I have a car',
    transportLift: 'Someone can drive me',
    transportNone: 'I have no transport',
  },
}
```

- [ ] **Step 5: Write the Mandarin pack**

`lib/i18n/phrases/zh.ts`:

```ts
import type { PhrasePack } from '../types'

export const zh: PhrasePack = {
  levelName: {
    'emergency-warning': '紧急警报',
    'watch-and-act': '注意并行动',
    advice: '提示',
    'planned-burn': '计划烧除',
    'not-applicable': '事件记录',
  },
  levelMeaning: {
    'emergency-warning': '您现在有危险。',
    'watch-and-act': '火势接近。请立即做好离开的准备。',
    advice: '附近有火。目前没有直接危险。',
    'planned-burn': '这是消防员有计划点燃的火。您可能会看到烟。',
    'not-applicable': '这是一条事件记录，不是警报。',
  },
  levelAction: {
    'emergency-warning': '不要等待。请立即按照下面的官方指示行动。',
    'watch-and-act': '请做好离开的准备。不要等到下一次警报。',
    advice: '请继续关注最新消息。',
    'planned-burn': '您无需采取行动。如果有烟，请关好门窗。',
    'not-applicable': '您无需采取行动。',
  },
  statusValues: {
    'out of control': '火势尚未得到控制。',
    'being controlled': '消防员正在控制火势。',
    'under control': '火势已得到控制。',
  },
  typeValues: {
    'bush fire': '丛林火灾',
    'grass fire': '草地火灾',
    'structure fire': '建筑火灾',
  },
  fields: {
    location: '地点',
    council: '地方政府区域',
    status: '状态',
    size: '火场面积',
    updated: '更新时间',
    agency: '负责机构',
  },
  ui: {
    yourArea: '您所在的区域',
    noWarningsTitle: '您附近目前没有警报',
    noWarningsBody: '我们会持续查看官方信息。情况有变化时会显示在这里。',
    officialWording: '官方原文（英文）',
    viewOfficial: '查看官方页面',
    listen: '朗读',
    stopListening: '停止',
    audioUnavailable: '此设备无法朗读这种语言。',
    getHelp: '获取帮助',
    callNow: '立即拨打',
    dataAsOf: '信息更新于',
    offlineNotice: '您目前处于离线状态。这是最后收到的信息。',
    demoBanner: '演示模式：这是模拟数据，不是真实警报。',
    kmAway: '公里外',
    youAreInside: '您位于火灾影响范围内',
    setupTitle: '设置 SafeSignal',
    setupIntro: '请回答几个问题，我们会为您显示合适的信息。',
    chooseLanguage: '选择您的语言',
    whereYouLive: '您住在哪里？',
    searchPlace: '输入城镇名称或邮政编码',
    useMyLocation: '使用我的当前位置',
    mobilityQuestion: '您行动方便吗？',
    transportQuestion: '如果需要离开，您有交通工具吗？',
    largeTextLabel: '大号字体',
    audioLabel: '自动朗读警报',
    saveAndContinue: '保存并继续',
    changeSettings: '修改设置',
    whatToDo: '您现在应该做什么',
    shareSituation: '把我的情况发给别人',
    sourceRfs: '来源：新南威尔士州乡村消防局',
    mobilityNone: '我可以自己走动',
    mobilityLimited: '我走路有困难',
    mobilityWheelchair: '我使用轮椅',
    mobilityBedbound: '我卧床，需要他人帮助',
    transportOwnCar: '我有车',
    transportLift: '有人可以载我',
    transportNone: '我没有交通工具',
  },
}
```

- [ ] **Step 6: Write the Hindi pack**

`lib/i18n/phrases/hi.ts`:

```ts
import type { PhrasePack } from '../types'

export const hi: PhrasePack = {
  levelName: {
    'emergency-warning': 'आपातकालीन चेतावनी',
    'watch-and-act': 'सतर्क रहें और कार्रवाई करें',
    advice: 'सूचना',
    'planned-burn': 'नियोजित आग',
    'not-applicable': 'दर्ज घटना',
  },
  levelMeaning: {
    'emergency-warning': 'आप अभी खतरे में हैं।',
    'watch-and-act': 'आग पास है। अभी निकलने की तैयारी करें।',
    advice: 'पास में आग लगी है। अभी कोई सीधा खतरा नहीं है।',
    'planned-burn': 'यह आग दमकल कर्मियों ने जानबूझकर लगाई है। आपको धुआँ दिख सकता है।',
    'not-applicable': 'यह एक दर्ज घटना है, चेतावनी नहीं।',
  },
  levelAction: {
    'emergency-warning': 'इंतज़ार न करें। नीचे दी गई आधिकारिक सलाह का तुरंत पालन करें।',
    'watch-and-act': 'निकलने की तैयारी करें। अगली चेतावनी का इंतज़ार न करें।',
    advice: 'नई जानकारी देखते रहें।',
    'planned-burn': 'आपको कुछ करने की ज़रूरत नहीं है। धुआँ हो तो खिड़कियाँ बंद रखें।',
    'not-applicable': 'आपको कुछ करने की ज़रूरत नहीं है।',
  },
  statusValues: {
    'out of control': 'आग काबू में नहीं है।',
    'being controlled': 'दमकल कर्मी आग पर काबू पा रहे हैं।',
    'under control': 'आग काबू में है।',
  },
  typeValues: {
    'bush fire': 'जंगल की आग',
    'grass fire': 'घास की आग',
    'structure fire': 'इमारत में आग',
  },
  fields: {
    location: 'जगह',
    council: 'स्थानीय परिषद क्षेत्र',
    status: 'स्थिति',
    size: 'आग का क्षेत्रफल',
    updated: 'अपडेट किया गया',
    agency: 'ज़िम्मेदार एजेंसी',
  },
  ui: {
    yourArea: 'आपका क्षेत्र',
    noWarningsTitle: 'आपके पास अभी कोई चेतावनी नहीं है',
    noWarningsBody: 'हम आधिकारिक जानकारी जाँचते रहते हैं। स्थिति बदलने पर यहाँ दिखाई देगा।',
    officialWording: 'आधिकारिक शब्द (अंग्रेज़ी में)',
    viewOfficial: 'आधिकारिक पेज देखें',
    listen: 'सुनें',
    stopListening: 'रोकें',
    audioUnavailable: 'यह डिवाइस इस भाषा को बोलकर नहीं सुना सकता।',
    getHelp: 'मदद लें',
    callNow: 'अभी कॉल करें',
    dataAsOf: 'जानकारी इस समय तक',
    offlineNotice: 'आप ऑफ़लाइन हैं। यह आखिरी मिली जानकारी है।',
    demoBanner: 'डेमो मोड: यह नकली जानकारी है, असली चेतावनी नहीं।',
    kmAway: 'किलोमीटर दूर',
    youAreInside: 'आप आग के क्षेत्र के अंदर हैं',
    setupTitle: 'SafeSignal सेट करें',
    setupIntro: 'कुछ सवालों के जवाब दें ताकि हम आपको सही जानकारी दिखा सकें।',
    chooseLanguage: 'अपनी भाषा चुनें',
    whereYouLive: 'आप कहाँ रहते हैं?',
    searchPlace: 'शहर का नाम या पोस्टकोड लिखें',
    useMyLocation: 'मेरी मौजूदा जगह इस्तेमाल करें',
    mobilityQuestion: 'क्या आप आसानी से चल-फिर सकते हैं?',
    transportQuestion: 'अगर निकलना पड़े, तो क्या आपके पास जाने का साधन है?',
    largeTextLabel: 'बड़े अक्षर',
    audioLabel: 'चेतावनी अपने आप पढ़कर सुनाएँ',
    saveAndContinue: 'सहेजें और आगे बढ़ें',
    changeSettings: 'सेटिंग बदलें',
    whatToDo: 'आपको अभी क्या करना चाहिए',
    shareSituation: 'मेरी स्थिति किसी को भेजें',
    sourceRfs: 'स्रोत: NSW ग्रामीण अग्निशमन सेवा',
    mobilityNone: 'मैं खुद चल सकता/सकती हूँ',
    mobilityLimited: 'मुझे चलने में कठिनाई होती है',
    mobilityWheelchair: 'मैं व्हीलचेयर इस्तेमाल करता/करती हूँ',
    mobilityBedbound: 'मैं बिस्तर पर हूँ और मुझे मदद चाहिए',
    transportOwnCar: 'मेरे पास गाड़ी है',
    transportLift: 'कोई मुझे ले जा सकता है',
    transportNone: 'मेरे पास कोई साधन नहीं है',
  },
}
```

- [ ] **Step 7: Write the Vietnamese pack**

`lib/i18n/phrases/vi.ts`:

```ts
import type { PhrasePack } from '../types'

export const vi: PhrasePack = {
  levelName: {
    'emergency-warning': 'Cảnh báo khẩn cấp',
    'watch-and-act': 'Theo dõi và hành động',
    advice: 'Thông báo',
    'planned-burn': 'Đốt có kế hoạch',
    'not-applicable': 'Sự việc đã ghi nhận',
  },
  levelMeaning: {
    'emergency-warning': 'Bạn đang gặp nguy hiểm ngay lúc này.',
    'watch-and-act': 'Đám cháy đang ở gần. Hãy chuẩn bị rời đi ngay.',
    advice: 'Có đám cháy ở gần. Hiện chưa có nguy hiểm trực tiếp.',
    'planned-burn': 'Đám cháy này do lính cứu hỏa chủ động đốt. Bạn có thể thấy khói.',
    'not-applicable': 'Đây là sự việc được ghi nhận, không phải cảnh báo.',
  },
  levelAction: {
    'emergency-warning': 'Đừng chờ đợi. Hãy làm theo hướng dẫn chính thức bên dưới ngay.',
    'watch-and-act': 'Hãy chuẩn bị rời đi. Đừng chờ cảnh báo tiếp theo.',
    advice: 'Hãy tiếp tục theo dõi thông tin mới.',
    'planned-burn': 'Bạn không cần làm gì. Hãy đóng cửa sổ nếu có khói.',
    'not-applicable': 'Bạn không cần làm gì.',
  },
  statusValues: {
    'out of control': 'Đám cháy chưa được kiểm soát.',
    'being controlled': 'Lính cứu hỏa đang kiểm soát đám cháy.',
    'under control': 'Đám cháy đã được kiểm soát.',
  },
  typeValues: {
    'bush fire': 'Cháy rừng',
    'grass fire': 'Cháy đồng cỏ',
    'structure fire': 'Cháy nhà',
  },
  fields: {
    location: 'Địa điểm',
    council: 'Khu vực hội đồng',
    status: 'Tình trạng',
    size: 'Diện tích cháy',
    updated: 'Cập nhật lúc',
    agency: 'Cơ quan phụ trách',
  },
  ui: {
    yourArea: 'Khu vực của bạn',
    noWarningsTitle: 'Hiện không có cảnh báo nào gần bạn',
    noWarningsBody: 'Chúng tôi liên tục kiểm tra thông tin chính thức. Nếu có thay đổi, bạn sẽ thấy ở đây.',
    officialWording: 'Nguyên văn chính thức (tiếng Anh)',
    viewOfficial: 'Xem trang chính thức',
    listen: 'Nghe',
    stopListening: 'Dừng',
    audioUnavailable: 'Thiết bị này không đọc được ngôn ngữ này.',
    getHelp: 'Nhận trợ giúp',
    callNow: 'Gọi ngay',
    dataAsOf: 'Thông tin tính đến',
    offlineNotice: 'Bạn đang ngoại tuyến. Đây là thông tin nhận được gần nhất.',
    demoBanner: 'Chế độ minh họa: đây là dữ liệu mô phỏng, không phải cảnh báo thật.',
    kmAway: 'km',
    youAreInside: 'Bạn đang ở trong khu vực đám cháy',
    setupTitle: 'Thiết lập SafeSignal',
    setupIntro: 'Hãy trả lời vài câu hỏi để chúng tôi hiển thị thông tin phù hợp với bạn.',
    chooseLanguage: 'Chọn ngôn ngữ của bạn',
    whereYouLive: 'Bạn sống ở đâu?',
    searchPlace: 'Nhập tên thị trấn hoặc mã bưu điện',
    useMyLocation: 'Dùng vị trí hiện tại của tôi',
    mobilityQuestion: 'Bạn đi lại có dễ dàng không?',
    transportQuestion: 'Nếu phải rời đi, bạn có phương tiện không?',
    largeTextLabel: 'Chữ lớn',
    audioLabel: 'Tự động đọc cảnh báo',
    saveAndContinue: 'Lưu và tiếp tục',
    changeSettings: 'Thay đổi cài đặt',
    whatToDo: 'Bạn nên làm gì bây giờ',
    shareSituation: 'Gửi tình trạng của tôi cho người khác',
    sourceRfs: 'Nguồn: Sở Cứu hỏa Nông thôn NSW',
    mobilityNone: 'Tôi tự đi lại được',
    mobilityLimited: 'Tôi đi lại khó khăn',
    mobilityWheelchair: 'Tôi dùng xe lăn',
    mobilityBedbound: 'Tôi nằm liệt giường và cần người giúp',
    transportOwnCar: 'Tôi có xe',
    transportLift: 'Có người chở tôi được',
    transportNone: 'Tôi không có phương tiện',
  },
}
```

- [ ] **Step 8: Write the registry**

`lib/i18n/index.ts`:

```ts
import type { LanguageCode } from '@/lib/domain/profile'
import type { PhrasePack } from './types'
import { en } from './phrases/en'
import { zh } from './phrases/zh'
import { hi } from './phrases/hi'
import { vi } from './phrases/vi'

export { UI_KEYS } from './types'
export type { PhrasePack, UIKey } from './types'

export const PACKS: Record<LanguageCode, PhrasePack> = { en, zh, hi, vi }

export function getPack(language: LanguageCode): PhrasePack {
  return PACKS[language] ?? PACKS.en
}

/** BCP 47 tags handed to speechSynthesis and to the html lang attribute. */
export const SPEECH_LOCALE: Record<LanguageCode, string> = {
  en: 'en-AU',
  zh: 'zh-CN',
  hi: 'hi-IN',
  vi: 'vi-VN',
}

/** Each language named in itself, so the picker is readable to its own speakers. */
export const LANGUAGE_NAMES: Record<LanguageCode, string> = {
  en: 'English',
  zh: '中文',
  hi: 'हिन्दी',
  vi: 'Tiếng Việt',
}
```

- [ ] **Step 9: Run the test to verify it passes**

```bash
npm test -- lib/i18n/index.test.ts
```

Expected: all passing.

- [ ] **Step 10: Commit**

```bash
git add lib/i18n
git commit -m "Add phrase packs for English, Mandarin, Hindi, Vietnamese"
```

---

### Task 13: Warning rendering

Produces both tiers at once: the plain-language rendering, and the reconstructed official English wording that sits beneath it. Producing them together is what guarantees they never drift apart.

**Files:**
- Create: `lib/i18n/render.ts`
- Test: `lib/i18n/render.test.ts`

**Interfaces:**
- Consumes: `RelevantWarning` (Task 8); `getPack`, `SPEECH_LOCALE` (Task 12); `LanguageCode` (Task 9)
- Produces:
  - `interface RenderedWarning`
  - `renderWarning(relevant: RelevantWarning, language: LanguageCode): RenderedWarning`

- [ ] **Step 1: Write the failing test**

`lib/i18n/render.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { renderWarning } from './render'
import type { RelevantWarning } from '@/lib/domain/match'

const relevant: RelevantWarning = {
  warning: {
    id: 'incident-1',
    level: 'watch-and-act',
    title: 'GREEN GULLY TRAIL, KATOOMBA',
    location: 'Green Gully Trail, Katoomba',
    council: 'Blue Mountains',
    status: 'Out of control',
    type: 'Bush Fire',
    sizeHa: 180,
    agency: 'Rural Fire Service',
    updatedAt: new Date('2026-11-14T03:22:00.000Z'),
    publishedAt: new Date('2026-11-14T03:00:00.000Z'),
    point: { lat: -33.67, lon: 150.31 },
    polygons: [],
    officialUrl: 'https://www.rfs.nsw.gov.au/fire-information/fires-near-me',
    rawAdvice: 'Conditions are changing and the fire is moving towards the area.',
  },
  distanceKm: 4.8,
  inside: false,
  band: 'very-close',
}

describe('renderWarning', () => {
  it('renders the official label and the plain meaning separately', () => {
    const r = renderWarning(relevant, 'en')
    expect(r.levelName).toBe('Watch and Act')
    expect(r.levelMeaning).toBe('A fire is close. Get ready to leave now.')
  })

  it('translates the label and meaning', () => {
    const r = renderWarning(relevant, 'vi')
    expect(r.levelName).toBe('Theo dõi và hành động')
    expect(r.levelMeaning).toBe('Đám cháy đang ở gần. Hãy chuẩn bị rời đi ngay.')
  })

  it('translates the RFS status string', () => {
    expect(renderWarning(relevant, 'en').statusText).toBe('The fire is not under control.')
    expect(renderWarning(relevant, 'zh').statusText).toBe('火势尚未得到控制。')
  })

  it('falls back to the raw status when the value is not in the pack', () => {
    const unknown = { ...relevant, warning: { ...relevant.warning, status: 'Patrolled' } }
    expect(renderWarning(unknown, 'zh').statusText).toBe('Patrolled')
  })

  it('renders distance in the chosen language', () => {
    expect(renderWarning(relevant, 'en').distanceText).toBe('4.8 km away')
    expect(renderWarning(relevant, 'zh').distanceText).toBe('4.8 公里外')
  })

  it('says the user is inside rather than giving a distance', () => {
    const inside = { ...relevant, inside: true, band: 'inside' as const }
    expect(renderWarning(inside, 'en').distanceText).toBe('You are inside the fire area')
  })

  it('gives no distance text when the location is unknown', () => {
    const unknown = { ...relevant, distanceKm: null, band: 'unknown' as const }
    expect(renderWarning(unknown, 'en').distanceText).toBeNull()
  })

  it('rebuilds the official English wording regardless of chosen language', () => {
    const r = renderWarning(relevant, 'hi')
    expect(r.officialText).toContain('ALERT LEVEL: Watch and Act')
    expect(r.officialText).toContain('LOCATION: Green Gully Trail, Katoomba')
    expect(r.officialText).toContain('STATUS: Out of control')
    expect(r.officialText).toContain('Conditions are changing')
  })

  it('formats the update time as Sydney local time', () => {
    // 03:22 UTC on 14 Nov is 14:22 in Sydney (AEDT).
    expect(renderWarning(relevant, 'en').updatedText).toContain('14:22')
  })

  it('builds speech text from the meaning and the action, not the jargon', () => {
    const r = renderWarning(relevant, 'en')
    expect(r.speechText).toContain('A fire is close.')
    expect(r.speechText).toContain('Get ready to leave.')
    expect(r.speechLocale).toBe('en-AU')
  })

  it('handles a warning with no update time', () => {
    const undated = { ...relevant, warning: { ...relevant.warning, updatedAt: null } }
    expect(renderWarning(undated, 'en').updatedText).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- lib/i18n/render.test.ts
```

Expected: FAIL, cannot resolve `./render`.

- [ ] **Step 3: Implement**

`lib/i18n/render.ts`:

```ts
import type { RelevantWarning } from '@/lib/domain/match'
import type { LanguageCode } from '@/lib/domain/profile'
import { getPack, SPEECH_LOCALE } from './index'

export interface RenderedWarning {
  /** The official label, which may be unfamiliar. */
  levelName: string
  /** What the label means, in plain words. */
  levelMeaning: string
  /** What to do about it. */
  levelAction: string
  placeText: string
  statusText: string
  typeText: string
  sizeText: string | null
  distanceText: string | null
  updatedText: string | null
  /** The exact official English wording, always shown beneath the above. */
  officialText: string
  officialUrl: string
  speechText: string
  speechLocale: string
}

const OFFICIAL_LEVEL: Record<string, string> = {
  'emergency-warning': 'Emergency Warning',
  'watch-and-act': 'Watch and Act',
  advice: 'Advice',
  'planned-burn': 'Planned Burn',
  'not-applicable': 'Not Applicable',
}

const sydneyTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Australia/Sydney',
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

/** Rebuilds the official English text so it can sit under the translation. */
function buildOfficialText(relevant: RelevantWarning): string {
  const w = relevant.warning
  const lines = [
    `ALERT LEVEL: ${OFFICIAL_LEVEL[w.level] ?? w.level}`,
    w.location ? `LOCATION: ${w.location}` : null,
    w.council ? `COUNCIL AREA: ${w.council}` : null,
    w.status ? `STATUS: ${w.status}` : null,
    w.type ? `TYPE: ${w.type}` : null,
    w.sizeHa !== null ? `SIZE: ${w.sizeHa} ha` : null,
    w.agency ? `RESPONSIBLE AGENCY: ${w.agency}` : null,
  ].filter((line): line is string => line !== null)

  if (w.rawAdvice) lines.push('', w.rawAdvice)
  return lines.join('\n')
}

export function renderWarning(
  relevant: RelevantWarning,
  language: LanguageCode,
): RenderedWarning {
  const pack = getPack(language)
  const w = relevant.warning

  const statusText = pack.statusValues[w.status.trim().toLowerCase()] ?? w.status
  const typeText = pack.typeValues[w.type.trim().toLowerCase()] ?? w.type

  let distanceText: string | null = null
  if (relevant.inside) {
    distanceText = pack.ui.youAreInside
  } else if (relevant.distanceKm !== null) {
    distanceText = `${relevant.distanceKm.toFixed(1)} ${pack.ui.kmAway}`
  }

  const levelMeaning = pack.levelMeaning[w.level]
  const levelAction = pack.levelAction[w.level]

  return {
    levelName: pack.levelName[w.level],
    levelMeaning,
    levelAction,
    placeText: w.location || w.title,
    statusText,
    typeText,
    sizeText: w.sizeHa !== null ? `${w.sizeHa} ha` : null,
    distanceText,
    updatedText: w.updatedAt ? sydneyTime.format(w.updatedAt) : null,
    officialText: buildOfficialText(relevant),
    officialUrl: w.officialUrl,
    // Speaks the meaning and the action, never the jargon label.
    speechText: [levelMeaning, w.location, statusText, levelAction]
      .filter(Boolean)
      .join(' '),
    speechLocale: SPEECH_LOCALE[language],
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test -- lib/i18n/render.test.ts
```

Expected: all passing.

- [ ] **Step 5: Commit**

```bash
git add lib/i18n/render.ts lib/i18n/render.test.ts
git commit -m "Add two-tier warning rendering with official English wording"
```

---

### Task 14: Text to speech

Three things routinely go wrong here and all three are handled explicitly: Chrome returns an empty voice list on the first call, the default rate is too fast for comprehension, and a device with no voice for the language must say so rather than fail silently.

**Files:**
- Create: `lib/speech/tts.ts`
- Test: `lib/speech/tts.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `interface SpeechCapability { supported: boolean; hasVoice: boolean }`
  - `getVoicesAsync(timeoutMs?: number): Promise<SpeechSynthesisVoice[]>`
  - `pickVoice(voices: SpeechSynthesisVoice[], locale: string): SpeechSynthesisVoice | null`
  - `checkCapability(locale: string): Promise<SpeechCapability>`
  - `speak(text: string, locale: string): Promise<void>`
  - `stopSpeaking(): void`

- [ ] **Step 1: Write the failing test**

`lib/speech/tts.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { pickVoice } from './tts'

const voice = (lang: string, name = lang): SpeechSynthesisVoice =>
  ({ lang, name, default: false, localService: true, voiceURI: name }) as SpeechSynthesisVoice

describe('pickVoice', () => {
  it('prefers an exact locale match', () => {
    const voices = [voice('en-US'), voice('zh-CN'), voice('zh-TW')]
    expect(pickVoice(voices, 'zh-CN')?.lang).toBe('zh-CN')
  })

  it('falls back to the same base language when the region differs', () => {
    const voices = [voice('en-US'), voice('zh-TW')]
    expect(pickVoice(voices, 'zh-CN')?.lang).toBe('zh-TW')
  })

  it('accepts underscore-separated tags, which some Android builds report', () => {
    expect(pickVoice([voice('hi_IN')], 'hi-IN')?.lang).toBe('hi_IN')
  })

  it('returns null when no voice matches the language at all', () => {
    expect(pickVoice([voice('en-US'), voice('fr-FR')], 'vi-VN')).toBeNull()
  })

  it('returns null for an empty voice list rather than throwing', () => {
    expect(pickVoice([], 'en-AU')).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- lib/speech/tts.test.ts
```

Expected: FAIL, cannot resolve `./tts`.

- [ ] **Step 3: Implement**

`lib/speech/tts.ts`:

```ts
export interface SpeechCapability {
  supported: boolean
  hasVoice: boolean
}

/** Slower than default. Comprehension matters more than speed here. */
const RATE = 0.9

const baseLanguage = (tag: string): string =>
  tag.replace('_', '-').split('-')[0].toLowerCase()

export function pickVoice(
  voices: SpeechSynthesisVoice[],
  locale: string,
): SpeechSynthesisVoice | null {
  const wanted = locale.replace('_', '-').toLowerCase()
  const exact = voices.find((v) => v.lang.replace('_', '-').toLowerCase() === wanted)
  if (exact) return exact

  const sameLanguage = voices.find((v) => baseLanguage(v.lang) === baseLanguage(locale))
  return sameLanguage ?? null
}

/**
 * Chrome populates the voice list asynchronously, so the first getVoices()
 * call returns an empty array. Waits for voiceschanged, with a timeout so a
 * browser that never fires it cannot hang the caller.
 */
export function getVoicesAsync(timeoutMs = 1500): Promise<SpeechSynthesisVoice[]> {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return Promise.resolve([])
  }

  const synth = window.speechSynthesis
  const immediate = synth.getVoices()
  if (immediate.length > 0) return Promise.resolve(immediate)

  return new Promise((resolve) => {
    let settled = false

    const finish = () => {
      if (settled) return
      settled = true
      synth.removeEventListener('voiceschanged', finish)
      resolve(synth.getVoices())
    }

    synth.addEventListener('voiceschanged', finish)
    setTimeout(finish, timeoutMs)
  })
}

export async function checkCapability(locale: string): Promise<SpeechCapability> {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return { supported: false, hasVoice: false }
  }
  const voices = await getVoicesAsync()
  return { supported: true, hasVoice: pickVoice(voices, locale) !== null }
}

export function stopSpeaking(): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
}

export async function speak(text: string, locale: string): Promise<void> {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
  if (!text.trim()) return

  const voices = await getVoicesAsync()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = locale
  utterance.rate = RATE

  const voice = pickVoice(voices, locale)
  if (voice) utterance.voice = voice

  // Cancel first: queued utterances otherwise stack up on repeated taps.
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(utterance)
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test -- lib/speech/tts.test.ts
```

Expected: all passing.

- [ ] **Step 5: Commit**

```bash
git add lib/speech/tts.ts lib/speech/tts.test.ts
git commit -m "Add speech synthesis with async voice loading and fallback detection"
```

---

### Task 15: Official service directory

Every entry is a real, publicly listed Australian number. Service copy lives beside the service definition rather than in the phrase pack, so adding a service does not mean touching four translation files.

Ordering is the whole feature. The same six services, reordered by profile, is what makes a wheelchair user with no car see transport help first and a Mandarin speaker see the free interpreter line first.

**Files:**
- Create: `lib/help/services.ts`
- Test: `lib/help/services.test.ts`

**Interfaces:**
- Consumes: `AlertLevel` (Task 4); `LanguageCode`, `UserProfile` (Task 9)
- Produces:
  - `interface HelpContext { level: AlertLevel | null; inside: boolean; profile: UserProfile }`
  - `interface OfficialService { id; name; phone; phoneDisplay; descriptions: Record<LanguageCode, string> }`
  - `SERVICES: OfficialService[]`
  - `rankServices(context: HelpContext): OfficialService[]`

- [ ] **Step 1: Write the failing test**

`lib/help/services.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { SERVICES, rankServices } from './services'
import { LANGUAGE_CODES, DEFAULT_PROFILE, type UserProfile } from '@/lib/domain/profile'

const profile = (overrides: Partial<UserProfile> = {}): UserProfile => ({
  ...DEFAULT_PROFILE,
  ...overrides,
})

describe('SERVICES', () => {
  it('describes every service in every supported language', () => {
    for (const service of SERVICES) {
      for (const code of LANGUAGE_CODES) {
        expect(service.descriptions[code], `${service.id}.${code}`).toBeTruthy()
      }
    }
  })

  it('has a dialable phone number for every service', () => {
    for (const service of SERVICES) {
      expect(service.phone, service.id).toMatch(/^[0-9]+$/)
    }
  })

  it('has unique ids', () => {
    const ids = SERVICES.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('rankServices', () => {
  it('puts Triple Zero first during an emergency warning', () => {
    const ranked = rankServices({
      level: 'emergency-warning',
      inside: false,
      profile: profile(),
    })
    expect(ranked[0].id).toBe('triple-zero')
  })

  it('puts Triple Zero first when the user is inside the fire area', () => {
    const ranked = rankServices({ level: 'advice', inside: true, profile: profile() })
    expect(ranked[0].id).toBe('triple-zero')
  })

  it('hides the interpreter line for an English speaker', () => {
    const ranked = rankServices({ level: 'advice', inside: false, profile: profile({ language: 'en' }) })
    expect(ranked.map((s) => s.id)).not.toContain('tis-national')
  })

  it('shows the interpreter line high up for a Mandarin speaker', () => {
    const ranked = rankServices({
      level: 'emergency-warning',
      inside: false,
      profile: profile({ language: 'zh' }),
    })
    expect(ranked.slice(0, 2).map((s) => s.id)).toContain('tis-national')
  })

  it('lifts evacuation and transport help for a wheelchair user with no car', () => {
    const ranked = rankServices({
      level: 'watch-and-act',
      inside: false,
      profile: profile({ mobility: 'wheelchair', transport: 'no-transport' }),
    })
    const withCar = rankServices({
      level: 'watch-and-act',
      inside: false,
      profile: profile({ mobility: 'none', transport: 'own-car' }),
    })
    expect(ranked.findIndex((s) => s.id === 'service-nsw'))
      .toBeLessThan(withCar.findIndex((s) => s.id === 'service-nsw'))
  })

  it('produces the full ordering for the scenario in the problem statement', () => {
    // Older Mandarin-speaking wheelchair user with no car, during an emergency warning.
    const ranked = rankServices({
      level: 'emergency-warning',
      inside: false,
      profile: profile({ language: 'zh', mobility: 'wheelchair', transport: 'no-transport' }),
    })
    expect(ranked.map((s) => s.id)).toEqual([
      'triple-zero',
      'tis-national',
      'service-nsw',
      'rfs-info',
      'relay-service',
      'ses',
    ])
  })

  it('leads with the information line, not Triple Zero, when nothing is urgent', () => {
    const ranked = rankServices({ level: 'advice', inside: false, profile: profile() })
    expect(ranked[0].id).toBe('rfs-info')
  })

  it('is stable when there is no warning at all', () => {
    const ranked = rankServices({ level: null, inside: false, profile: profile() })
    expect(ranked.length).toBeGreaterThan(0)
    expect(ranked[0].id).toBe('rfs-info')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- lib/help/services.test.ts
```

Expected: FAIL, cannot resolve `./services`.

- [ ] **Step 3: Implement**

`lib/help/services.ts`:

```ts
import type { AlertLevel } from '@/lib/domain/warning'
import type { LanguageCode, UserProfile } from '@/lib/domain/profile'

export interface HelpContext {
  level: AlertLevel | null
  inside: boolean
  profile: UserProfile
}

export interface OfficialService {
  id: string
  /** Kept in English: this is the name the operator will answer with. */
  name: string
  /** Digits only, for the tel: link. */
  phone: string
  phoneDisplay: string
  descriptions: Record<LanguageCode, string>
  show: (context: HelpContext) => boolean
  priority: (context: HelpContext) => number
}

const isUrgent = (context: HelpContext): boolean =>
  context.inside || context.level === 'emergency-warning'

const needsAssistedEvacuation = (context: HelpContext): boolean =>
  context.profile.transport === 'no-transport' ||
  context.profile.mobility !== 'none'

export const SERVICES: OfficialService[] = [
  {
    id: 'triple-zero',
    name: 'Triple Zero (Police, Fire, Ambulance)',
    phone: '000',
    phoneDisplay: '000',
    descriptions: {
      en: 'Call if you are in danger right now and need help immediately.',
      zh: '如果您现在有危险，需要立即救助，请拨打此号码。',
      hi: 'अगर आप अभी खतरे में हैं और तुरंत मदद चाहिए, तो यहाँ कॉल करें।',
      vi: 'Gọi nếu bạn đang gặp nguy hiểm và cần trợ giúp ngay lập tức.',
    },
    show: () => true,
    priority: (context) => (isUrgent(context) ? 100 : 50),
  },
  {
    id: 'tis-national',
    name: 'TIS National (free interpreter)',
    phone: '131450',
    phoneDisplay: '131 450',
    descriptions: {
      en: 'A free interpreter can join your call to any Australian service.',
      zh: '免费口译员可以加入您与任何澳大利亚机构的通话。',
      hi: 'एक मुफ़्त दुभाषिया किसी भी ऑस्ट्रेलियाई सेवा के साथ आपकी कॉल में जुड़ सकता है।',
      vi: 'Thông dịch viên miễn phí có thể tham gia cuộc gọi của bạn với bất kỳ dịch vụ nào ở Úc.',
    },
    show: (context) => context.profile.language !== 'en',
    priority: () => 90,
  },
  {
    id: 'service-nsw',
    name: 'Service NSW (evacuation and disaster help)',
    phone: '137788',
    phoneDisplay: '13 77 88',
    descriptions: {
      en: 'Ask about evacuation centres and help getting out if you cannot travel on your own.',
      zh: '可咨询疏散中心，以及在您无法自行前往时如何获得协助。',
      hi: 'निकासी केंद्रों के बारे में और अगर आप खुद नहीं जा सकते तो मदद के बारे में पूछें।',
      vi: 'Hỏi về trung tâm sơ tán và cách được giúp đỡ nếu bạn không thể tự đi.',
    },
    show: () => true,
    priority: (context) => (needsAssistedEvacuation(context) ? 85 : 30),
  },
  {
    id: 'rfs-info',
    name: 'NSW RFS Bush Fire Information Line',
    phone: '1800679737',
    phoneDisplay: '1800 679 737',
    descriptions: {
      en: 'Ask about a bush fire near you. This is not for emergencies.',
      zh: '可咨询您附近的丛林火灾情况。此号码不用于紧急求助。',
      hi: 'अपने पास की जंगल की आग के बारे में पूछें। यह आपात स्थिति के लिए नहीं है।',
      vi: 'Hỏi về đám cháy rừng gần bạn. Số này không dùng cho trường hợp khẩn cấp.',
    },
    show: () => true,
    priority: () => 60,
  },
  {
    id: 'relay-service',
    name: 'National Relay Service',
    phone: '133677',
    phoneDisplay: '133 677',
    descriptions: {
      en: 'Use this if you are deaf, or have difficulty hearing or speaking.',
      zh: '如果您失聪，或听力、语言有困难，可以使用此服务。',
      hi: 'अगर आप बहरे हैं, या सुनने-बोलने में कठिनाई है, तो इसका उपयोग करें।',
      vi: 'Dùng dịch vụ này nếu bạn bị điếc hoặc khó nghe, khó nói.',
    },
    show: () => true,
    priority: () => 20,
  },
  {
    id: 'ses',
    name: 'NSW SES (storm and flood)',
    phone: '132500',
    phoneDisplay: '132 500',
    descriptions: {
      en: 'For storm and flood damage, not fire.',
      zh: '用于风暴和洪水损失，不适用于火灾。',
      hi: 'तूफ़ान और बाढ़ के नुकसान के लिए, आग के लिए नहीं।',
      vi: 'Dành cho thiệt hại do bão và lũ, không phải cháy.',
    },
    show: () => true,
    priority: () => 10,
  },
]

export function rankServices(context: HelpContext): OfficialService[] {
  return SERVICES.filter((service) => service.show(context)).sort(
    (a, b) => b.priority(context) - a.priority(context),
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test -- lib/help/services.test.ts
```

Expected: all passing.

- [ ] **Step 5: Commit**

```bash
git add lib/help/services.ts lib/help/services.test.ts
git commit -m "Add profile-ranked official service directory"
```

---

### Task 16: English call script

The user taps what they need and gets an English script to read aloud or show to the operator, with the same sentences in their own language beside it so they know what they are saying.

**Files:**
- Create: `lib/help/callScript.ts`
- Test: `lib/help/callScript.test.ts`

**Interfaces:**
- Consumes: `Warning` (Task 4); `LanguageCode`, `UserProfile` (Task 9)
- Produces:
  - `type HelpNeed = 'evacuate' | 'information' | 'check-on-me'`
  - `interface CallScript { english: string[]; translated: string[] }`
  - `buildCallScript(profile: UserProfile, warning: Warning | null, need: HelpNeed): CallScript`

- [ ] **Step 1: Write the failing test**

`lib/help/callScript.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildCallScript } from './callScript'
import { DEFAULT_PROFILE, type UserProfile } from '@/lib/domain/profile'
import type { Warning } from '@/lib/domain/warning'

const katoomba = { lat: -33.7128, lon: 150.3119, label: 'Katoomba' }

const profile = (overrides: Partial<UserProfile> = {}): UserProfile => ({
  ...DEFAULT_PROFILE,
  location: katoomba,
  ...overrides,
})

const warning: Warning = {
  id: 'demo',
  level: 'emergency-warning',
  title: 'GREEN GULLY TRAIL, KATOOMBA',
  location: 'Green Gully Trail, Katoomba',
  council: 'Blue Mountains',
  status: 'Out of control',
  type: 'Bush Fire',
  sizeHa: 840,
  agency: 'Rural Fire Service',
  updatedAt: null,
  publishedAt: null,
  point: { lat: -33.69, lon: 150.31 },
  polygons: [],
  officialUrl: 'https://example.invalid',
  rawAdvice: null,
}

describe('buildCallScript', () => {
  it('produces the same number of lines in both languages', () => {
    const script = buildCallScript(
      profile({ language: 'zh', mobility: 'wheelchair', transport: 'no-transport' }),
      warning,
      'evacuate',
    )
    expect(script.english.length).toBe(script.translated.length)
    expect(script.english.length).toBeGreaterThan(3)
  })

  it('states the need, the place, the mobility, and the transport situation', () => {
    const script = buildCallScript(
      profile({ mobility: 'wheelchair', transport: 'no-transport' }),
      warning,
      'evacuate',
    )
    const text = script.english.join(' ')
    expect(text).toContain('I need help to leave my home')
    expect(text).toContain('Katoomba')
    expect(text).toContain('I use a wheelchair')
    expect(text).toContain('I do not have any transport')
  })

  it('asks for an interpreter only when the user does not speak English', () => {
    const zh = buildCallScript(profile({ language: 'zh' }), warning, 'evacuate')
    expect(zh.english.join(' ')).toContain('I speak Mandarin')

    const en = buildCallScript(profile({ language: 'en' }), warning, 'evacuate')
    expect(en.english.join(' ')).not.toContain('interpreter')
  })

  it('names the official alert level so the operator knows the context', () => {
    const script = buildCallScript(profile(), warning, 'evacuate')
    expect(script.english.join(' ')).toContain('Emergency Warning')
  })

  it('omits the fire sentence when there is no warning', () => {
    const script = buildCallScript(profile(), null, 'information')
    expect(script.english.join(' ')).not.toContain('Emergency Warning')
    expect(script.english.length).toBeGreaterThan(1)
  })

  it('says the place is unknown rather than printing an empty gap', () => {
    const script = buildCallScript(profile({ location: null }), warning, 'evacuate')
    expect(script.english.join(' ')).not.toContain('I am at .')
  })

  it('translates every line for a Vietnamese speaker', () => {
    const script = buildCallScript(
      profile({ language: 'vi', mobility: 'bedbound', transport: 'no-transport' }),
      warning,
      'check-on-me',
    )
    for (const line of script.translated) {
      expect(line.length).toBeGreaterThan(0)
    }
    expect(script.translated.join(' ')).toContain('Katoomba')
  })

  it('omits mobility and transport sentences when neither is a barrier', () => {
    const script = buildCallScript(
      profile({ mobility: 'none', transport: 'own-car' }),
      warning,
      'information',
    )
    const text = script.english.join(' ')
    expect(text).not.toContain('wheelchair')
    expect(text).not.toContain('do not have any transport')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- lib/help/callScript.test.ts
```

Expected: FAIL, cannot resolve `./callScript`.

- [ ] **Step 3: Implement**

`lib/help/callScript.ts`:

```ts
import type { Warning } from '@/lib/domain/warning'
import type { LanguageCode, UserProfile } from '@/lib/domain/profile'

export type HelpNeed = 'evacuate' | 'information' | 'check-on-me'

export interface CallScript {
  /** Read aloud to the operator, or show them the screen. */
  english: string[]
  /** The same sentences, so the caller knows what they are saying. */
  translated: string[]
}

type LineKey =
  | 'needEvacuate'
  | 'needInformation'
  | 'needCheckOnMe'
  | 'atPlace'
  | 'placeUnknown'
  | 'fireNear'
  | 'mobilityLimited'
  | 'mobilityWheelchair'
  | 'mobilityBedbound'
  | 'transportNone'
  | 'transportLift'
  | 'needInterpreter'

const LEVEL_LABEL: Record<string, string> = {
  'emergency-warning': 'Emergency Warning',
  'watch-and-act': 'Watch and Act',
  advice: 'Advice',
  'planned-burn': 'Planned Burn',
  'not-applicable': 'incident',
}

/** The language name as an operator would recognise it. */
const LANGUAGE_IN_ENGLISH: Record<LanguageCode, string> = {
  en: 'English',
  zh: 'Mandarin',
  hi: 'Hindi',
  vi: 'Vietnamese',
}

const LINES: Record<LanguageCode, Record<LineKey, string>> = {
  en: {
    needEvacuate: 'Hello. I need help to leave my home because of a bush fire.',
    needInformation: 'Hello. I need information about a bush fire near me.',
    needCheckOnMe: 'Hello. I am not able to leave and I need someone to check on me.',
    atPlace: 'I am at {place}.',
    placeUnknown: 'I am in New South Wales. I can give you my address.',
    fireNear: 'There is a bush fire near me. The official warning is {level}.',
    mobilityLimited: 'I have difficulty walking.',
    mobilityWheelchair: 'I use a wheelchair.',
    mobilityBedbound: 'I am in bed and I cannot move without help.',
    transportNone: 'I do not have any transport.',
    transportLift: 'Someone may be able to drive me, but I am not sure.',
    needInterpreter: 'I speak {language}. Please connect me to an interpreter.',
  },
  zh: {
    needEvacuate: '您好。因为丛林火灾，我需要帮助离开家。',
    needInformation: '您好。我想了解我附近丛林火灾的情况。',
    needCheckOnMe: '您好。我无法离开，需要有人来看看我。',
    atPlace: '我在{place}。',
    placeUnknown: '我在新南威尔士州。我可以告诉您我的地址。',
    fireNear: '我附近有丛林火灾。官方警报级别是{level}。',
    mobilityLimited: '我走路有困难。',
    mobilityWheelchair: '我使用轮椅。',
    mobilityBedbound: '我卧床，没有帮助无法移动。',
    transportNone: '我没有任何交通工具。',
    transportLift: '可能有人可以载我，但我不确定。',
    needInterpreter: '我说{language}。请为我接通口译员。',
  },
  hi: {
    needEvacuate: 'नमस्ते। जंगल की आग के कारण मुझे अपना घर छोड़ने में मदद चाहिए।',
    needInformation: 'नमस्ते। मुझे अपने पास की जंगल की आग के बारे में जानकारी चाहिए।',
    needCheckOnMe: 'नमस्ते। मैं जा नहीं सकता/सकती, कोई मुझे देखने आ जाए।',
    atPlace: 'मैं {place} में हूँ।',
    placeUnknown: 'मैं न्यू साउथ वेल्स में हूँ। मैं आपको अपना पता बता सकता/सकती हूँ।',
    fireNear: 'मेरे पास जंगल की आग है। आधिकारिक चेतावनी {level} है।',
    mobilityLimited: 'मुझे चलने में कठिनाई होती है।',
    mobilityWheelchair: 'मैं व्हीलचेयर इस्तेमाल करता/करती हूँ।',
    mobilityBedbound: 'मैं बिस्तर पर हूँ और बिना मदद के हिल नहीं सकता/सकती।',
    transportNone: 'मेरे पास कोई साधन नहीं है।',
    transportLift: 'शायद कोई मुझे ले जा सके, पर मुझे यकीन नहीं है।',
    needInterpreter: 'मैं {language} बोलता/बोलती हूँ। कृपया मुझे दुभाषिये से जोड़ें।',
  },
  vi: {
    needEvacuate: 'Xin chào. Tôi cần giúp đỡ để rời khỏi nhà vì cháy rừng.',
    needInformation: 'Xin chào. Tôi cần thông tin về đám cháy rừng gần nhà tôi.',
    needCheckOnMe: 'Xin chào. Tôi không thể rời đi và cần ai đó đến xem tôi thế nào.',
    atPlace: 'Tôi đang ở {place}.',
    placeUnknown: 'Tôi đang ở New South Wales. Tôi có thể cho bạn địa chỉ của tôi.',
    fireNear: 'Có cháy rừng gần tôi. Mức cảnh báo chính thức là {level}.',
    mobilityLimited: 'Tôi đi lại khó khăn.',
    mobilityWheelchair: 'Tôi dùng xe lăn.',
    mobilityBedbound: 'Tôi nằm liệt giường và không thể di chuyển nếu không có người giúp.',
    transportNone: 'Tôi không có phương tiện nào.',
    transportLift: 'Có thể có người chở tôi, nhưng tôi không chắc.',
    needInterpreter: 'Tôi nói tiếng {language}. Xin hãy nối máy cho tôi với thông dịch viên.',
  },
}

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? '')
}

export function buildCallScript(
  profile: UserProfile,
  warning: Warning | null,
  need: HelpNeed,
): CallScript {
  const keys: LineKey[] = []

  if (need === 'evacuate') keys.push('needEvacuate')
  else if (need === 'information') keys.push('needInformation')
  else keys.push('needCheckOnMe')

  if (profile.language !== 'en') keys.push('needInterpreter')
  keys.push(profile.location ? 'atPlace' : 'placeUnknown')
  if (warning) keys.push('fireNear')

  if (profile.mobility === 'limited-walking') keys.push('mobilityLimited')
  if (profile.mobility === 'wheelchair') keys.push('mobilityWheelchair')
  if (profile.mobility === 'bedbound') keys.push('mobilityBedbound')

  if (profile.transport === 'no-transport') keys.push('transportNone')
  if (profile.transport === 'can-get-lift') keys.push('transportLift')

  const values = {
    place: profile.location?.label ?? '',
    level: warning ? (LEVEL_LABEL[warning.level] ?? warning.level) : '',
    language: LANGUAGE_IN_ENGLISH[profile.language],
  }

  return {
    english: keys.map((key) => fill(LINES.en[key], values)),
    translated: keys.map((key) => fill(LINES[profile.language][key], values)),
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test -- lib/help/callScript.test.ts
```

Expected: all passing.

- [ ] **Step 5: Commit**

```bash
git add lib/help/callScript.ts lib/help/callScript.test.ts
git commit -m "Add bilingual English call script builder"
```

---

### Task 17: Action checklist and share message

The checklist takes its steps from the warning's own official advice text, split into sentences. That is what keeps the "SafeSignal creates no emergency advice" claim true: every checked item is a sentence the RFS wrote, tagged as such. The one non-official line is our plain-language restatement of the alert level, and it is labelled differently so the distinction is visible on screen.

**Files:**
- Create: `lib/help/checklist.ts`, `lib/help/share.ts`
- Test: `lib/help/checklist.test.ts`, `lib/help/share.test.ts`

**Interfaces:**
- Consumes: `Warning` (Task 4); `LanguageCode`, `UserProfile` (Task 9); `getPack` (Task 12); `RelevantWarning` (Task 8)
- Produces:
  - `interface ChecklistItem { text: string; source: 'nsw-rfs' | 'safesignal' }`
  - `buildChecklist(warning: Warning | null, language: LanguageCode): ChecklistItem[]`
  - `buildShareMessage(profile: UserProfile, relevant: RelevantWarning | null): string`
  - `shareSituation(message: string): Promise<'shared' | 'copied' | 'unsupported'>`

- [ ] **Step 1: Write the failing tests**

`lib/help/checklist.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildChecklist } from './checklist'
import type { Warning } from '@/lib/domain/warning'

const warning = (rawAdvice: string | null): Warning => ({
  id: 'demo',
  level: 'emergency-warning',
  title: 'T',
  location: 'L',
  council: 'C',
  status: 'Out of control',
  type: 'Bush Fire',
  sizeHa: 1,
  agency: 'Rural Fire Service',
  updatedAt: null,
  publishedAt: null,
  point: null,
  polygons: [],
  officialUrl: 'https://example.invalid',
  rawAdvice,
})

describe('buildChecklist', () => {
  it('leads with the plain-language action, marked as SafeSignal wording', () => {
    const items = buildChecklist(warning(null), 'en')
    expect(items[0].source).toBe('safesignal')
    expect(items[0].text).toBe('Do not wait. Follow the official advice below now.')
  })

  it('splits the official advice into one step per sentence, tagged to the RFS', () => {
    const items = buildChecklist(
      warning('You are in danger. Leave now towards the east. Do not return.'),
      'en',
    )
    const official = items.filter((i) => i.source === 'nsw-rfs')
    expect(official.map((i) => i.text)).toEqual([
      'You are in danger.',
      'Leave now towards the east.',
      'Do not return.',
    ])
  })

  it('invents nothing when there is no official advice text', () => {
    const items = buildChecklist(warning(null), 'en')
    expect(items.filter((i) => i.source === 'nsw-rfs')).toHaveLength(0)
    expect(items).toHaveLength(1)
  })

  it('translates the plain-language line but leaves official sentences verbatim', () => {
    const items = buildChecklist(warning('Leave now towards the east.'), 'zh')
    expect(items[0].text).toBe('不要等待。请立即按照下面的官方指示行动。')
    expect(items[1].text).toBe('Leave now towards the east.')
  })

  it('returns an empty list when there is no warning', () => {
    expect(buildChecklist(null, 'en')).toEqual([])
  })

  it('ignores stray whitespace and empty sentence fragments', () => {
    const items = buildChecklist(warning('Leave now.   Stay away.  '), 'en')
    expect(items.filter((i) => i.source === 'nsw-rfs')).toHaveLength(2)
  })
})
```

`lib/help/share.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { buildShareMessage, shareSituation } from './share'
import { DEFAULT_PROFILE, type UserProfile } from '@/lib/domain/profile'
import type { RelevantWarning } from '@/lib/domain/match'

const profile = (overrides: Partial<UserProfile> = {}): UserProfile => ({
  ...DEFAULT_PROFILE,
  location: { lat: -33.7128, lon: 150.3119, label: 'Katoomba' },
  ...overrides,
})

const relevant: RelevantWarning = {
  warning: {
    id: 'demo',
    level: 'emergency-warning',
    title: 'GREEN GULLY TRAIL, KATOOMBA',
    location: 'Green Gully Trail, Katoomba',
    council: 'Blue Mountains',
    status: 'Out of control',
    type: 'Bush Fire',
    sizeHa: 840,
    agency: 'Rural Fire Service',
    updatedAt: null,
    publishedAt: null,
    point: { lat: -33.69, lon: 150.31 },
    polygons: [],
    officialUrl: 'https://example.invalid',
    rawAdvice: null,
  },
  distanceKm: 2.1,
  inside: false,
  band: 'very-close',
}

afterEach(() => vi.unstubAllGlobals())

describe('buildShareMessage', () => {
  it('states the alert level, the place, and the distance', () => {
    const message = buildShareMessage(profile(), relevant)
    expect(message).toContain('Emergency Warning')
    expect(message).toContain('Katoomba')
    expect(message).toContain('2.1 km')
  })

  it('states the needs that make evacuation harder', () => {
    const message = buildShareMessage(
      profile({ mobility: 'wheelchair', transport: 'no-transport' }),
      relevant,
    )
    expect(message).toContain('wheelchair')
    expect(message).toContain('no transport')
  })

  it('omits need lines when there are none', () => {
    const message = buildShareMessage(profile({ mobility: 'none', transport: 'own-car' }), relevant)
    expect(message).not.toContain('wheelchair')
    expect(message).not.toContain('no transport')
  })

  it('still produces a usable message with no warning', () => {
    const message = buildShareMessage(profile(), null)
    expect(message).toContain('Katoomba')
    expect(message.length).toBeGreaterThan(20)
  })

  it('names SafeSignal as the sender so the recipient knows the source', () => {
    expect(buildShareMessage(profile(), relevant)).toContain('SafeSignal')
  })
})

describe('shareSituation', () => {
  it('uses the Web Share API when available', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { share })
    await expect(shareSituation('hello')).resolves.toBe('shared')
    expect(share).toHaveBeenCalledWith({ text: 'hello' })
  })

  it('falls back to the clipboard when sharing is unavailable', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    await expect(shareSituation('hello')).resolves.toBe('copied')
    expect(writeText).toHaveBeenCalledWith('hello')
  })

  it('reports unsupported rather than throwing when neither exists', async () => {
    vi.stubGlobal('navigator', {})
    await expect(shareSituation('hello')).resolves.toBe('unsupported')
  })

  it('reports unsupported when the user cancels the share sheet', async () => {
    vi.stubGlobal('navigator', { share: vi.fn().mockRejectedValue(new Error('AbortError')) })
    await expect(shareSituation('hello')).resolves.toBe('unsupported')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm test -- lib/help/checklist.test.ts lib/help/share.test.ts
```

Expected: FAIL, cannot resolve the modules.

- [ ] **Step 3: Implement the checklist**

`lib/help/checklist.ts`:

```ts
import type { Warning } from '@/lib/domain/warning'
import type { LanguageCode } from '@/lib/domain/profile'
import { getPack } from '@/lib/i18n'

export interface ChecklistItem {
  text: string
  /** Where the sentence came from. Rendered on screen, never hidden. */
  source: 'nsw-rfs' | 'safesignal'
}

/**
 * Official sentences are kept verbatim and in English. Translating free-text
 * emergency advice by machine is exactly the kind of invention this app
 * refuses to do; the Claude layer handles that path when it is available.
 */
function officialSentences(rawAdvice: string): string[] {
  return rawAdvice
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0)
}

export function buildChecklist(
  warning: Warning | null,
  language: LanguageCode,
): ChecklistItem[] {
  if (!warning) return []

  const pack = getPack(language)
  const items: ChecklistItem[] = [
    { text: pack.levelAction[warning.level], source: 'safesignal' },
  ]

  if (warning.rawAdvice) {
    for (const sentence of officialSentences(warning.rawAdvice)) {
      items.push({ text: sentence, source: 'nsw-rfs' })
    }
  }

  return items
}
```

- [ ] **Step 4: Implement the share message**

`lib/help/share.ts`:

```ts
import type { UserProfile } from '@/lib/domain/profile'
import type { RelevantWarning } from '@/lib/domain/match'

const LEVEL_LABEL: Record<string, string> = {
  'emergency-warning': 'Emergency Warning',
  'watch-and-act': 'Watch and Act',
  advice: 'Advice',
  'planned-burn': 'Planned Burn',
  'not-applicable': 'incident',
}

const MOBILITY_LINE: Record<string, string> = {
  'limited-walking': 'I have difficulty walking.',
  wheelchair: 'I use a wheelchair.',
  bedbound: 'I am in bed and cannot move without help.',
}

/**
 * Written in English: the recipient is a neighbour, family member, or
 * emergency contact in Australia.
 */
export function buildShareMessage(
  profile: UserProfile,
  relevant: RelevantWarning | null,
): string {
  const place = profile.location?.label ?? 'New South Wales'
  const lines: string[] = [`I am at ${place}.`]

  if (relevant) {
    const level = LEVEL_LABEL[relevant.warning.level] ?? relevant.warning.level
    const where = relevant.warning.location || relevant.warning.title
    lines.push(`There is a bush fire ${level} for ${where}.`)
    if (relevant.inside) lines.push('I am inside the fire area.')
    else if (relevant.distanceKm !== null) {
      lines.push(`It is about ${relevant.distanceKm.toFixed(1)} km from me.`)
    }
  }

  const mobility = MOBILITY_LINE[profile.mobility]
  if (mobility) lines.push(mobility)
  if (profile.transport === 'no-transport') lines.push('I have no transport.')

  lines.push('Sent from SafeSignal.')
  return lines.join('\n')
}

export async function shareSituation(
  message: string,
): Promise<'shared' | 'copied' | 'unsupported'> {
  const nav = typeof navigator === 'undefined' ? undefined : navigator

  if (nav?.share) {
    try {
      await nav.share({ text: message })
      return 'shared'
    } catch {
      // Includes the user dismissing the share sheet, which is not an error.
      return 'unsupported'
    }
  }

  if (nav?.clipboard?.writeText) {
    try {
      await nav.clipboard.writeText(message)
      return 'copied'
    } catch {
      return 'unsupported'
    }
  }

  return 'unsupported'
}
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npm test -- lib/help/checklist.test.ts lib/help/share.test.ts
```

Expected: all passing.

- [ ] **Step 6: Run the whole suite**

```bash
npm test
```

Expected: every test from Tasks 1 through 17 passing. This is the last task before UI work, so the entire logic layer should be green here.

- [ ] **Step 7: Commit**

```bash
git add lib/help/checklist.ts lib/help/checklist.test.ts lib/help/share.ts lib/help/share.test.ts
git commit -m "Add sourced action checklist and share message"
```

---

### Task 18: Design system and profile provider

Large text is a scale factor on a single custom property, so the entire type ramp and every tap target grow together. Bumping one font size instead would leave 44px buttons holding 24px text.

Alert levels carry a colour, a distinct shape, and a word. Any one of the three alone would fail somebody: colour fails colour-blind users, shape fails screen readers, and the word alone fails at a glance in bright sun.

The font stack names Devanagari fallbacks explicitly. Without them Hindi renders as empty boxes on some devices, and nobody notices until the language is switched for the first time.

**Files:**
- Create: `components/ProfileProvider.tsx`, `components/AlertBadge.tsx`
- Modify: `app/globals.css`, `app/layout.tsx`

**Interfaces:**
- Consumes: `UserProfile`, `loadProfile`, `saveProfile` (Task 9); `SPEECH_LOCALE`, `getPack` (Task 12)
- Produces:
  - `useProfile(): { profile: UserProfile; update(patch: Partial<UserProfile>): void; ready: boolean }`
  - `usePack(): PhrasePack`
  - `<AlertBadge level={AlertLevel} label={string} />`

- [ ] **Step 1: Replace `app/globals.css`**

```css
:root {
  --scale: 1;

  --font-body: system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans",
    "Noto Sans Devanagari", "Nirmala UI", "Noto Sans CJK SC", sans-serif;

  --text-sm: calc(0.875rem * var(--scale));
  --text-base: calc(1rem * var(--scale));
  --text-lg: calc(1.25rem * var(--scale));
  --text-xl: calc(1.625rem * var(--scale));
  --text-2xl: calc(2.125rem * var(--scale));

  --tap-min: calc(44px * var(--scale));
  --space-1: calc(4px * var(--scale));
  --space-2: calc(8px * var(--scale));
  --space-3: calc(16px * var(--scale));
  --space-4: calc(24px * var(--scale));

  --ink: #14161a;
  --ink-muted: #55606e;
  --paper: #ffffff;
  --paper-sunk: #f3f5f8;
  --line: #d6dbe2;
  --focus: #0b5fff;

  --level-emergency-warning: #c8102e;
  --level-emergency-warning-ink: #ffffff;
  --level-watch-and-act: #e35205;
  --level-watch-and-act-ink: #ffffff;
  --level-advice: #ffc72c;
  --level-advice-ink: #14161a;
  --level-planned-burn: #0072ce;
  --level-planned-burn-ink: #ffffff;
  --level-not-applicable: #55606e;
  --level-not-applicable-ink: #ffffff;
}

/* Large text scales the ramp and the tap targets together. */
:root[data-text-size="large"] { --scale: 1.35; }

*, *::before, *::after { box-sizing: border-box; }

html, body { margin: 0; padding: 0; }

body {
  font-family: var(--font-body);
  font-size: var(--text-base);
  line-height: 1.55;
  color: var(--ink);
  background: var(--paper-sunk);
  -webkit-text-size-adjust: 100%;
}

main {
  max-width: 34rem;
  margin: 0 auto;
  padding: var(--space-3);
  padding-bottom: calc(var(--space-4) * 2);
}

h1 { font-size: var(--text-2xl); line-height: 1.2; margin: 0 0 var(--space-2); }
h2 { font-size: var(--text-xl); line-height: 1.25; margin: 0 0 var(--space-2); }
h3 { font-size: var(--text-lg); margin: 0 0 var(--space-1); }
p { margin: 0 0 var(--space-2); }

:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }

.card {
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: var(--space-3);
  margin-bottom: var(--space-3);
}

.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  min-height: var(--tap-min);
  min-width: var(--tap-min);
  padding: var(--space-2) var(--space-3);
  font: inherit;
  font-weight: 600;
  color: var(--paper);
  background: var(--ink);
  border: 2px solid transparent;
  border-radius: 10px;
  cursor: pointer;
  text-decoration: none;
  width: 100%;
}

.button--secondary { background: var(--paper); color: var(--ink); border-color: var(--line); }
.button--danger { background: var(--level-emergency-warning); }

.stack > * + * { margin-top: var(--space-2); }

.badge {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-3);
  border-radius: 999px;
  font-size: var(--text-base);
  font-weight: 700;
}

/* Shape carries the level too, so colour is never the only signal. */
.badge__shape { font-size: 1.1em; line-height: 1; }

.banner {
  padding: var(--space-2) var(--space-3);
  font-size: var(--text-sm);
  font-weight: 600;
  text-align: center;
}

.banner--demo { background: #4a2a80; color: #ffffff; }
.banner--offline { background: #55606e; color: #ffffff; }

.official {
  background: var(--paper-sunk);
  border-left: 4px solid var(--ink-muted);
  padding: var(--space-2) var(--space-3);
  font-size: var(--text-sm);
  white-space: pre-wrap;
}

.muted { color: var(--ink-muted); font-size: var(--text-sm); }

.field { display: block; margin-bottom: var(--space-3); }
.field > span { display: block; font-weight: 600; margin-bottom: var(--space-1); }

.control {
  width: 100%;
  min-height: var(--tap-min);
  padding: var(--space-2);
  font: inherit;
  border: 2px solid var(--line);
  border-radius: 10px;
  background: var(--paper);
  color: var(--ink);
}

.choice {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: var(--tap-min);
  padding: var(--space-2);
  border: 2px solid var(--line);
  border-radius: 10px;
  background: var(--paper);
  margin-bottom: var(--space-2);
  cursor: pointer;
}

.choice--selected { border-color: var(--focus); background: #eef3ff; }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
}
```

- [ ] **Step 2: Create the profile provider**

`components/ProfileProvider.tsx`:

```tsx
'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { DEFAULT_PROFILE, loadProfile, saveProfile, type UserProfile } from '@/lib/domain/profile'
import { getPack, SPEECH_LOCALE, type PhrasePack } from '@/lib/i18n'

interface ProfileContextValue {
  profile: UserProfile
  update: (patch: Partial<UserProfile>) => void
  ready: boolean
}

const ProfileContext = createContext<ProfileContextValue | null>(null)

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<UserProfile>(DEFAULT_PROFILE)
  const [ready, setReady] = useState(false)

  // localStorage is only available after hydration, so the first render uses
  // defaults and this fills in the real profile.
  useEffect(() => {
    setProfile(loadProfile())
    setReady(true)
  }, [])

  useEffect(() => {
    if (!ready) return
    const root = document.documentElement
    root.lang = SPEECH_LOCALE[profile.language]
    root.dataset.textSize = profile.largeText ? 'large' : 'normal'
  }, [profile.language, profile.largeText, ready])

  const update = useCallback((patch: Partial<UserProfile>) => {
    setProfile((current) => {
      const next = { ...current, ...patch }
      saveProfile(next)
      return next
    })
  }, [])

  const value = useMemo(() => ({ profile, update, ready }), [profile, update, ready])

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
}

export function useProfile(): ProfileContextValue {
  const context = useContext(ProfileContext)
  if (!context) throw new Error('useProfile must be used inside ProfileProvider')
  return context
}

export function usePack(): PhrasePack {
  return getPack(useProfile().profile.language)
}
```

- [ ] **Step 3: Create the alert badge**

`components/AlertBadge.tsx`:

```tsx
import type { AlertLevel } from '@/lib/domain/warning'

/** A distinct shape per level, so colour is never the only signal. */
const SHAPE: Record<AlertLevel, string> = {
  'emergency-warning': '▲',
  'watch-and-act': '◆',
  advice: '●',
  'planned-burn': '■',
  'not-applicable': '□',
}

export function AlertBadge({ level, label }: { level: AlertLevel; label: string }) {
  return (
    <span
      className="badge"
      style={{
        background: `var(--level-${level})`,
        color: `var(--level-${level}-ink)`,
      }}
    >
      <span className="badge__shape" aria-hidden="true">{SHAPE[level]}</span>
      <span>{label}</span>
    </span>
  )
}
```

- [ ] **Step 4: Wire the provider into the layout**

`app/layout.tsx`:

```tsx
import type { Metadata, Viewport } from 'next'
import { ProfileProvider } from '@/components/ProfileProvider'
import './globals.css'

export const metadata: Metadata = {
  title: 'SafeSignal',
  description: 'Official NSW bushfire warnings, made understandable.',
  manifest: '/manifest.json',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#c8102e',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-text-size="normal">
      <body>
        <ProfileProvider>{children}</ProfileProvider>
      </body>
    </html>
  )
}
```

- [ ] **Step 5: Verify in the browser**

```bash
npm run dev
```

Open `http://localhost:3000`. Expected: the page renders with the new type and background. In devtools, set `data-text-size="large"` on `<html>` and confirm text and spacing both grow.

- [ ] **Step 6: Commit**

```bash
git add app/globals.css app/layout.tsx components/ProfileProvider.tsx components/AlertBadge.tsx
git commit -m "Add design tokens, scaled type ramp, and profile provider"
```

---

### Task 19: Setup wizard

One question per screen, large targets, and no free-text location entry beyond a search box. Manual location entry is a first-class path here rather than a fallback, because a significant share of this user group will decline the geolocation prompt or not understand it.

**Files:**
- Create: `app/setup/page.tsx`, `components/ChoiceList.tsx`, `components/PlacePicker.tsx`

**Interfaces:**
- Consumes: `useProfile`, `usePack` (Task 18); `searchPlaces`, `NswPlace` (Task 9); `LANGUAGE_NAMES` (Task 12)
- Produces: a route at `/setup` that writes a completed `UserProfile` and navigates to `/`

- [ ] **Step 1: Create the choice list**

`components/ChoiceList.tsx`:

```tsx
'use client'

export interface Choice<T extends string> {
  value: T
  label: string
}

export function ChoiceList<T extends string>({
  legend,
  choices,
  selected,
  onSelect,
}: {
  legend: string
  choices: Choice<T>[]
  selected: T
  onSelect: (value: T) => void
}) {
  return (
    <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
      <legend style={{ fontWeight: 700, marginBottom: 'var(--space-2)' }}>{legend}</legend>
      {choices.map((choice) => (
        <label
          key={choice.value}
          className={`choice${selected === choice.value ? ' choice--selected' : ''}`}
        >
          <input
            type="radio"
            name={legend}
            value={choice.value}
            checked={selected === choice.value}
            onChange={() => onSelect(choice.value)}
          />
          <span>{choice.label}</span>
        </label>
      ))}
    </fieldset>
  )
}
```

- [ ] **Step 2: Create the place picker**

`components/PlacePicker.tsx`:

```tsx
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
  const [geoError, setGeoError] = useState(false)
  const results = searchPlaces(query)

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setGeoError(true)
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
      // A denied prompt is expected, not exceptional. The search box below
      // is already visible, so there is nothing to recover.
      () => setGeoError(true),
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
      {geoError && <p className="muted">{pack.ui.searchPlace}</p>}
    </div>
  )
}
```

- [ ] **Step 3: Create the setup page**

`app/setup/page.tsx`:

```tsx
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
```

- [ ] **Step 4: Verify in the browser**

```bash
npm run dev
```

Open `http://localhost:3000/setup`. Check each of these:

- Switching language changes every label on the page immediately
- Selecting Hindi renders Devanagari, not empty boxes
- Ticking large text visibly grows both the text and the buttons
- Searching `katoo` finds Katoomba, and `2780` finds it too
- Denying the geolocation prompt leaves the search box usable rather than blocking
- Reloading the page keeps every choice

- [ ] **Step 5: Commit**

```bash
git add app/setup/page.tsx components/ChoiceList.tsx components/PlacePicker.tsx
git commit -m "Add setup wizard with language, location, mobility, and display preferences"
```

---

### Task 20: Main warning screen with live and demo modes

The screen never chooses between "live" and "demo" logic. It subscribes to a `WarningSource` and renders whatever arrives, which is what makes the demo a real test of the app.

The source lives in a provider mounted at the layout, not in a per-page hook. Two pages each calling their own hook would each construct their own `DemoSource`, so tapping through to the help screen mid-demo would silently restart the scenario at step one and lose the `?demo=1` flag from the URL. The presenter would be showing live mode without knowing it.

**Files:**
- Create: `components/WarningProvider.tsx`, `components/WarningCard.tsx`, `components/SpeakButton.tsx`, `components/DemoControls.tsx`
- Modify: `app/page.tsx`, `app/layout.tsx`

**Interfaces:**
- Consumes: `LiveSource` (Task 10); `DemoSource`, `buildScenario` (Task 11); `matchWarnings` (Task 8); `renderWarning` (Task 13); `speak`, `stopSpeaking`, `checkCapability` (Task 14); `DEFAULT_DEMO_PLACE` (Task 9)
- Produces:
  - `<WarningProvider>` mounted inside `<ProfileProvider>` in the layout
  - `useWarnings(): { feed: WarningFeed; demo: DemoSource | null; demoState: DemoState | null; demoMode: boolean; setDemoMode(on: boolean): void }`

- [ ] **Step 1: Create the warning provider**

`components/WarningProvider.tsx`:

```tsx
'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { LiveSource } from '@/lib/sources/live'
import { DemoSource, type DemoState } from '@/lib/sources/demo'
import { buildScenario } from '@/lib/sources/scenario'
import type { WarningFeed } from '@/lib/sources/types'
import { DEFAULT_DEMO_PLACE } from '@/lib/locations/nsw'
import { useProfile } from './ProfileProvider'

const EMPTY: WarningFeed = { warnings: [], fetchedAt: null, stale: false }

interface WarningContextValue {
  feed: WarningFeed
  demo: DemoSource | null
  demoState: DemoState | null
  demoMode: boolean
  setDemoMode: (on: boolean) => void
}

const WarningContext = createContext<WarningContextValue | null>(null)

export function WarningProvider({ children }: { children: React.ReactNode }) {
  const { profile, ready } = useProfile()
  const [demoMode, setDemoMode] = useState(false)
  const [feed, setFeed] = useState<WarningFeed>(EMPTY)
  const [demoState, setDemoState] = useState<DemoState | null>(null)

  // A judge opening the shared link must reach the scenario without being
  // walked through a settings screen.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('demo') === '1') {
      setDemoMode(true)
    }
  }, [])

  const anchor = profile.location ?? {
    lat: DEFAULT_DEMO_PLACE.lat,
    lon: DEFAULT_DEMO_PLACE.lon,
    label: DEFAULT_DEMO_PLACE.label,
  }

  const demo = useMemo(
    () => (demoMode ? new DemoSource(buildScenario(anchor, anchor.label)) : null),
    // The scenario is anchored once per demo session; re-anchoring mid-run
    // would restart the escalation under the presenter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [demoMode, anchor.lat, anchor.lon, anchor.label],
  )

  useEffect(() => {
    if (!ready) return

    if (demo) {
      const unsubscribeFeed = demo.subscribe(setFeed)
      const unsubscribeState = demo.onStateChange(setDemoState)
      setDemoState(demo.state)
      return () => {
        unsubscribeFeed()
        unsubscribeState()
        demo.dispose()
      }
    }

    setDemoState(null)
    const live = new LiveSource()
    return live.subscribe(setFeed)
  }, [demo, ready])

  const value = useMemo(
    () => ({ feed, demo, demoState, demoMode, setDemoMode }),
    [feed, demo, demoState, demoMode],
  )

  return <WarningContext.Provider value={value}>{children}</WarningContext.Provider>
}

export function useWarnings(): WarningContextValue {
  const context = useContext(WarningContext)
  if (!context) throw new Error('useWarnings must be used inside WarningProvider')
  return context
}
```

- [ ] **Step 1b: Mount the provider in the layout**

In `app/layout.tsx`, import `WarningProvider` from `@/components/WarningProvider` and wrap `{children}` with it, inside `<ProfileProvider>`:

```tsx
<ProfileProvider>
  <WarningProvider>{children}</WarningProvider>
</ProfileProvider>
```

Both `/` and `/help` now read one shared source, so navigating between them keeps the demo on its current step.

- [ ] **Step 2: Create the speak button**

`components/SpeakButton.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { checkCapability, speak, stopSpeaking } from '@/lib/speech/tts'
import { usePack } from './ProfileProvider'

export function SpeakButton({ text, locale }: { text: string; locale: string }) {
  const pack = usePack()
  const [hasVoice, setHasVoice] = useState<boolean | null>(null)
  const [speaking, setSpeaking] = useState(false)

  useEffect(() => {
    let active = true
    void checkCapability(locale).then((capability) => {
      if (active) setHasVoice(capability.supported && capability.hasVoice)
    })
    return () => {
      active = false
      stopSpeaking()
    }
  }, [locale])

  // Say so plainly rather than presenting a button that does nothing.
  if (hasVoice === false) return <p className="muted">{pack.ui.audioUnavailable}</p>

  return (
    <button
      type="button"
      className="button button--secondary"
      onClick={() => {
        if (speaking) {
          stopSpeaking()
          setSpeaking(false)
          return
        }
        setSpeaking(true)
        void speak(text, locale)
      }}
    >
      {speaking ? pack.ui.stopListening : pack.ui.listen}
    </button>
  )
}
```

- [ ] **Step 3: Create the warning card**

`components/WarningCard.tsx`:

```tsx
'use client'

import Link from 'next/link'
import { AlertBadge } from './AlertBadge'
import { SpeakButton } from './SpeakButton'
import { usePack, useProfile } from './ProfileProvider'
import { renderWarning } from '@/lib/i18n/render'
import type { RelevantWarning } from '@/lib/domain/match'

export function WarningCard({ relevant }: { relevant: RelevantWarning }) {
  const { profile } = useProfile()
  const pack = usePack()
  const view = renderWarning(relevant, profile.language)

  return (
    <article className="card stack">
      <AlertBadge level={relevant.warning.level} label={view.levelName} />

      {/* The plain meaning is the headline. The official label is the badge. */}
      <h2>{view.levelMeaning}</h2>
      <p><strong>{view.placeText}</strong></p>
      {view.distanceText && <p>{view.distanceText}</p>}
      <p>{view.statusText}</p>
      <p><strong>{view.levelAction}</strong></p>

      <SpeakButton text={view.speechText} locale={view.speechLocale} />

      <details>
        <summary>{pack.ui.officialWording}</summary>
        <div className="official">{view.officialText}</div>
        <p className="muted">{pack.ui.sourceRfs}</p>
        <a className="button button--secondary" href={view.officialUrl} target="_blank" rel="noreferrer">
          {pack.ui.viewOfficial}
        </a>
      </details>

      {view.updatedText && (
        <p className="muted">{pack.fields.updated}: {view.updatedText}</p>
      )}

      <Link className="button button--danger" href="/help">{pack.ui.getHelp}</Link>
    </article>
  )
}
```

- [ ] **Step 4: Create the demo controls**

`components/DemoControls.tsx`:

```tsx
'use client'

import type { DemoSource, DemoState } from '@/lib/sources/demo'

export function DemoControls({ demo, state }: { demo: DemoSource; state: DemoState }) {
  return (
    <div className="card stack">
      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        <button
          type="button"
          className="button button--secondary"
          onClick={() => (state.playing ? demo.pause() : demo.play())}
        >
          {state.playing ? 'Pause' : 'Play'}
        </button>
        <button type="button" className="button button--secondary" onClick={() => demo.restart()}>
          Restart
        </button>
      </div>

      {/* Lets a presenter jump straight to the emergency warning. */}
      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        {Array.from({ length: state.totalSteps }, (_, index) => (
          <button
            key={index}
            type="button"
            className={`button ${index === state.stepIndex ? '' : 'button--secondary'}`}
            onClick={() => demo.seek(index)}
          >
            {index + 1}
          </button>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Replace the main page**

`app/page.tsx`:

```tsx
'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { useProfile, usePack } from '@/components/ProfileProvider'
import { useWarnings } from '@/components/WarningProvider'
import { WarningCard } from '@/components/WarningCard'
import { DemoControls } from '@/components/DemoControls'
import { matchWarnings } from '@/lib/domain/match'
import { renderWarning } from '@/lib/i18n/render'
import { speak } from '@/lib/speech/tts'

const sydneyTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Australia/Sydney',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

export default function Home() {
  const { profile, ready } = useProfile()
  const pack = usePack()
  const { feed, demo, demoState, demoMode, setDemoMode } = useWarnings()

  const relevant = matchWarnings(feed.warnings, profile.location)
  const top = relevant[0] ?? null
  const topId = top?.warning.id ?? null

  // Read the most urgent warning aloud when the user asked for audio.
  useEffect(() => {
    if (!profile.audio || !top) return
    const view = renderWarning(top, profile.language)
    void speak(view.speechText, view.speechLocale)
  }, [topId, profile.audio, profile.language])

  if (!ready) return <main><p>...</p></main>

  if (!profile.completedSetup) {
    return (
      <main className="stack">
        <h1>SafeSignal</h1>
        <p>{pack.ui.setupIntro}</p>
        <Link className="button" href="/setup">{pack.ui.saveAndContinue}</Link>
      </main>
    )
  }

  return (
    <>
      {demoMode && <div className="banner banner--demo">{pack.ui.demoBanner}</div>}
      {feed.stale && <div className="banner banner--offline">{pack.ui.offlineNotice}</div>}

      <main>
        <h1>{pack.ui.yourArea}</h1>
        <p className="muted">{profile.location?.label ?? ''}</p>

        {demo && demoState && <DemoControls demo={demo} state={demoState} />}

        {relevant.length === 0 ? (
          <div className="card">
            <h2>{pack.ui.noWarningsTitle}</h2>
            <p>{pack.ui.noWarningsBody}</p>
          </div>
        ) : (
          relevant.map((item) => <WarningCard key={item.warning.id} relevant={item} />)
        )}

        {/* Freshness is never optional: silent staleness is the dangerous failure. */}
        <p className="muted">
          {pack.ui.dataAsOf} {feed.fetchedAt ? sydneyTime.format(feed.fetchedAt) : '-'}
        </p>

        <div className="stack">
          <Link className="button button--secondary" href="/setup">{pack.ui.changeSettings}</Link>
          <button
            type="button"
            className="button button--secondary"
            onClick={() => setDemoMode(!demoMode)}
          >
            {demoMode ? 'Live mode' : 'Demo mode'}
          </button>
        </div>
      </main>
    </>
  )
}
```

- [ ] **Step 6: Verify both modes in the browser**

```bash
npm run dev
```

Live mode at `http://localhost:3000`: complete setup with Katoomba, confirm the screen renders real current warnings or the no-warnings card, and that the "information as at" time is a plausible Sydney time.

Demo mode at `http://localhost:3000/?demo=1`: confirm the purple simulated-data banner is present, press Play and watch the card escalate through all three levels, confirm Pause holds a state, and confirm the numbered buttons jump straight to step 3.

Switch language to Mandarin and repeat: the meaning, action, and status text should all change while the official wording block stays English.

- [ ] **Step 7: Commit**

```bash
git add components/WarningProvider.tsx app/layout.tsx components/WarningCard.tsx components/SpeakButton.tsx components/DemoControls.tsx app/page.tsx
git commit -m "Add warning screen with live and demo sources and presenter controls"
```

---

### Task 21: Help screen

Four features on one screen, ordered by how urgently someone needs them: who to call, what to say, what to do, and how to tell somebody.

**Files:**
- Create: `app/help/page.tsx`, `components/ServiceCard.tsx`, `components/CallScriptPanel.tsx`, `components/Checklist.tsx`

**Interfaces:**
- Consumes: `rankServices`, `OfficialService` (Task 15); `buildCallScript`, `HelpNeed` (Task 16); `buildChecklist`, `buildShareMessage`, `shareSituation` (Task 17); `useWarnings` (Task 20); `matchWarnings` (Task 8)
- Produces: a route at `/help`

- [ ] **Step 1: Create the service card**

`components/ServiceCard.tsx`:

```tsx
'use client'

import { useProfile, usePack } from './ProfileProvider'
import type { OfficialService } from '@/lib/help/services'

export function ServiceCard({ service }: { service: OfficialService }) {
  const { profile } = useProfile()
  const pack = usePack()

  return (
    <article className="card stack">
      <h3>{service.name}</h3>
      <p>{service.descriptions[profile.language]}</p>
      <a className="button" href={`tel:${service.phone}`}>
        {pack.ui.callNow} {service.phoneDisplay}
      </a>
    </article>
  )
}
```

- [ ] **Step 2: Create the call script panel**

`components/CallScriptPanel.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useProfile, usePack } from './ProfileProvider'
import { buildCallScript, type HelpNeed } from '@/lib/help/callScript'
import type { Warning } from '@/lib/domain/warning'

const NEEDS: { value: HelpNeed; label: string }[] = [
  { value: 'evacuate', label: 'I need help to leave' },
  { value: 'information', label: 'I need information' },
  { value: 'check-on-me', label: 'I need someone to check on me' },
]

export function CallScriptPanel({ warning }: { warning: Warning | null }) {
  const { profile } = useProfile()
  const pack = usePack()
  const [need, setNeed] = useState<HelpNeed>('evacuate')
  const script = buildCallScript(profile, warning, need)

  return (
    <section className="card stack">
      <h2>{pack.ui.whatToDo}</h2>

      {NEEDS.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`choice${need === option.value ? ' choice--selected' : ''}`}
          style={{ width: '100%', textAlign: 'left' }}
          onClick={() => setNeed(option.value)}
        >
          {option.label}
        </button>
      ))}

      {/* English to read or show the operator. */}
      <div className="official" lang="en">
        {script.english.join('\n')}
      </div>

      {/* The same sentences, so the caller knows what they are saying. */}
      {profile.language !== 'en' && (
        <div className="card" style={{ marginBottom: 0 }}>
          {script.translated.join('\n')}
        </div>
      )}
    </section>
  )
}
```

- [ ] **Step 3: Create the checklist**

`components/Checklist.tsx`:

```tsx
'use client'

import { usePack, useProfile } from './ProfileProvider'
import { buildChecklist } from '@/lib/help/checklist'
import type { Warning } from '@/lib/domain/warning'

export function Checklist({ warning }: { warning: Warning | null }) {
  const { profile } = useProfile()
  const pack = usePack()
  const items = buildChecklist(warning, profile.language)

  if (items.length === 0) return null

  return (
    <section className="card stack">
      <h2>{pack.ui.whatToDo}</h2>
      <ul style={{ paddingLeft: 'var(--space-3)' }}>
        {items.map((item, index) => (
          <li key={index} style={{ marginBottom: 'var(--space-2)' }}>
            <span lang={item.source === 'nsw-rfs' ? 'en' : undefined}>{item.text}</span>
            {/* Every official sentence carries its source on screen. */}
            <span className="muted"> {item.source === 'nsw-rfs' ? `(${pack.ui.sourceRfs})` : ''}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
```

- [ ] **Step 4: Create the help page**

`app/help/page.tsx`:

```tsx
'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useProfile, usePack } from '@/components/ProfileProvider'
import { useWarnings } from '@/components/WarningProvider'
import { ServiceCard } from '@/components/ServiceCard'
import { CallScriptPanel } from '@/components/CallScriptPanel'
import { Checklist } from '@/components/Checklist'
import { matchWarnings } from '@/lib/domain/match'
import { rankServices } from '@/lib/help/services'
import { buildShareMessage, shareSituation } from '@/lib/help/share'

export default function HelpPage() {
  const { profile, ready } = useProfile()
  const pack = usePack()
  const { feed } = useWarnings()
  const [shareResult, setShareResult] = useState<string | null>(null)

  if (!ready) return <main><p>...</p></main>

  const relevant = matchWarnings(feed.warnings, profile.location)
  const top = relevant[0] ?? null

  const services = rankServices({
    level: top?.warning.level ?? null,
    inside: top?.inside ?? false,
    profile,
  })

  return (
    <main>
      <h1>{pack.ui.getHelp}</h1>

      {services.map((service) => (
        <ServiceCard key={service.id} service={service} />
      ))}

      <CallScriptPanel warning={top?.warning ?? null} />

      <Checklist warning={top?.warning ?? null} />

      <section className="card stack">
        <button
          type="button"
          className="button button--secondary"
          onClick={async () => {
            const result = await shareSituation(buildShareMessage(profile, top))
            setShareResult(result)
          }}
        >
          {pack.ui.shareSituation}
        </button>
        {shareResult === 'copied' && <p className="muted">Copied to clipboard.</p>}
        {shareResult === 'unsupported' && (
          <div className="official">{buildShareMessage(profile, top)}</div>
        )}
      </section>

      <Link className="button button--secondary" href="/">{pack.ui.yourArea}</Link>
    </main>
  )
}
```

- [ ] **Step 5: Verify in the browser**

```bash
npm run dev
```

Set up a profile with Mandarin, wheelchair, and no transport, then open `http://localhost:3000/?demo=1`, play to the Emergency Warning, and tap through to `/help`. Confirm:

- Triple Zero is first, the interpreter line second, Service NSW third
- Every service description is in Mandarin, while the service names and phone numbers stay English and dialable
- The call script names the wheelchair, the lack of transport, and asks for a Mandarin interpreter
- Every checklist item taken from the RFS advice is tagged with its source
- Change the profile to English with a car, reload, and confirm the interpreter line disappears and the RFS information line moves to the top

Then check demo continuity specifically, because it is the failure most likely to appear on stage: play the demo to the Emergency Warning, tap Get help, and confirm the simulated-data banner is still showing and the services are still ranked for an emergency. Tap back and confirm the demo is still on step 3 rather than having restarted.

- [ ] **Step 6: Commit**

```bash
git add app/help/page.tsx components/ServiceCard.tsx components/CallScriptPanel.tsx components/Checklist.tsx
git commit -m "Add help screen with ranked services, call script, checklist, and share"
```

---

### Task 22: PWA and offline support

A bushfire is exactly when the mobile network is congested. Offline is a core requirement, not a checkbox.

The service worker serves the app shell cache-first, and the warnings API network-first with a cache fallback, so a failed request returns the last warnings the device saw instead of nothing.

**Files:**
- Create: `public/manifest.json`, `public/icon.svg`, `public/sw.js`, `components/ServiceWorker.tsx`
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: nothing
- Produces: an installable PWA that renders the last known warnings with no network

- [ ] **Step 1: Create the manifest**

`public/manifest.json`:

```json
{
  "name": "SafeSignal",
  "short_name": "SafeSignal",
  "description": "Official NSW bushfire warnings, made understandable.",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#c8102e",
  "icons": [
    { "src": "/icon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any maskable" }
  ]
}
```

- [ ] **Step 2: Create the icon**

`public/icon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" rx="96" fill="#c8102e"/>
  <path d="M256 96 L432 400 H80 Z" fill="#ffffff"/>
  <rect x="236" y="192" width="40" height="112" rx="20" fill="#c8102e"/>
  <circle cx="256" cy="344" r="24" fill="#c8102e"/>
</svg>
```

- [ ] **Step 3: Create the service worker**

`public/sw.js`:

```js
const CACHE = 'safesignal-v1'
const SHELL = ['/', '/setup', '/help', '/manifest.json', '/icon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Warnings: prefer fresh, but never leave the screen empty when offline.
  if (url.pathname === '/api/warnings') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(CACHE).then((cache) => cache.put(request, copy))
          return response
        })
        .catch(() => caches.match(request).then((cached) => cached ?? Response.json(
          { warnings: [], fetchedAt: null, stale: true, dropped: 0 },
        ))),
    )
    return
  }

  // Everything else: cache first, so the shell and phrase packs load offline.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached
      return fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(CACHE).then((cache) => cache.put(request, copy))
          return response
        })
        .catch(() => caches.match('/'))
    }),
  )
})
```

- [ ] **Step 4: Register the service worker**

`components/ServiceWorker.tsx`:

```tsx
'use client'

import { useEffect } from 'react'

export function ServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    // Registration failing is not worth surfacing: the app works without it.
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  }, [])

  return null
}
```

- [ ] **Step 5: Add it to the layout**

In `app/layout.tsx`, import `ServiceWorker` from `@/components/ServiceWorker` and render `<ServiceWorker />` immediately inside `<ProfileProvider>`, before `{children}`.

- [ ] **Step 6: Verify offline behaviour**

```bash
npm run build && npm start
```

Open `http://localhost:3000`, complete setup, and let the warnings load. Then in devtools, Application, Service Workers, tick Offline, and reload. Expected: the app still renders, the last warnings are still listed, and the grey offline banner appears. Confirm the install prompt is offered in Chrome.

- [ ] **Step 7: Commit**

```bash
git add public/manifest.json public/icon.svg public/sw.js components/ServiceWorker.tsx app/layout.tsx
git commit -m "Add PWA manifest, icon, and offline service worker"
```

---

### Task 23: Claude plain-language layer

Everything before this task works without an API key. This layer only enriches: when a warning carries free-text advice, Claude translates and simplifies it into the user's language. If the key is missing or the call fails, the screen is unchanged.

The prompt is constrained to translating and simplifying the supplied text. It must not add advice of its own, which is the whole product constraint expressed as a system prompt.

**Files:**
- Create: `app/api/simplify/route.ts`, `components/useSimplifiedAdvice.ts`, `.env.example`
- Modify: `components/WarningCard.tsx`

**Interfaces:**
- Consumes: `LanguageCode` (Task 9)
- Produces:
  - `POST /api/simplify` accepting `{ text: string; language: LanguageCode }` and returning `{ text: string | null }`
  - `useSimplifiedAdvice(rawAdvice: string | null, language: LanguageCode): string | null`

- [ ] **Step 1: Record the environment variable**

`.env.example`:

```
# Optional. Without it, SafeSignal falls back to phrase-pack rendering and
# shows official advice in English. Nothing breaks.
ANTHROPIC_API_KEY=
```

Add a real `.env.local` with the key if you have one. `.env*.local` is already gitignored.

- [ ] **Step 2: Create the route**

`app/api/simplify/route.ts`:

```ts
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const LANGUAGE_NAME: Record<string, string> = {
  en: 'English',
  zh: 'Simplified Chinese',
  hi: 'Hindi',
  vi: 'Vietnamese',
}

const SYSTEM_PROMPT = `You translate official Australian bushfire warnings for people with low English confidence.

Rules you must not break:
- Translate and simplify ONLY the text you are given.
- Never add advice, instructions, or facts that are not in the source text.
- Never remove a safety instruction that is in the source text.
- Use short sentences and everyday words. Aim for a reading age of about 10.
- Reply with the translated text only. No preamble, no notes, no quotes.`

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  // No key is a supported configuration, not an error.
  if (!apiKey) return NextResponse.json({ text: null })

  let body: { text?: unknown; language?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ text: null })
  }

  const text = typeof body.text === 'string' ? body.text.trim() : ''
  const language = typeof body.language === 'string' ? body.language : 'en'
  const languageName = LANGUAGE_NAME[language]

  if (!text || !languageName) return NextResponse.json({ text: null })

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 600,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Translate into ${languageName}:\n\n${text}`,
          },
        ],
      }),
    })

    if (!response.ok) throw new Error(`Anthropic responded ${response.status}`)

    const data = (await response.json()) as { content?: { type: string; text?: string }[] }
    const simplified = data.content?.find((block) => block.type === 'text')?.text?.trim()

    return NextResponse.json({ text: simplified || null })
  } catch {
    // The phrase-pack rendering is already on screen. Degrade silently.
    return NextResponse.json({ text: null })
  }
}
```

- [ ] **Step 3: Create the client hook**

`components/useSimplifiedAdvice.ts`:

```ts
'use client'

import { useEffect, useState } from 'react'
import type { LanguageCode } from '@/lib/domain/profile'

/**
 * Returns null whenever the enrichment is unavailable, which every caller
 * must treat as normal rather than as an error.
 */
export function useSimplifiedAdvice(
  rawAdvice: string | null,
  language: LanguageCode,
): string | null {
  const [simplified, setSimplified] = useState<string | null>(null)

  useEffect(() => {
    setSimplified(null)
    if (!rawAdvice || language === 'en') return

    let active = true
    fetch('/api/simplify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: rawAdvice, language }),
    })
      .then((response) => response.json() as Promise<{ text: string | null }>)
      .then((data) => {
        if (active) setSimplified(data.text)
      })
      .catch(() => {})

    return () => {
      active = false
    }
  }, [rawAdvice, language])

  return simplified
}
```

- [ ] **Step 4: Show it in the warning card**

In `components/WarningCard.tsx`, add the import:

```tsx
import { useSimplifiedAdvice } from './useSimplifiedAdvice'
```

Inside the component, after `const view = renderWarning(...)`:

```tsx
const simplified = useSimplifiedAdvice(relevant.warning.rawAdvice, profile.language)
```

Then render it directly above the `<SpeakButton>`, so it never displaces the official wording:

```tsx
{simplified && (
  <div className="card" style={{ marginBottom: 0 }}>
    <p>{simplified}</p>
    <p className="muted">{pack.ui.sourceRfs}</p>
  </div>
)}
```

- [ ] **Step 5: Verify both configurations**

With no `ANTHROPIC_API_KEY` set:

```bash
npm run dev
```

Open `http://localhost:3000/?demo=1`, set the language to Vietnamese, and play to the Emergency Warning. Expected: the card renders fully with the phrase-pack text and the English official wording, and no error appears anywhere.

Then add a real key to `.env.local`, restart the dev server, and repeat. Expected: an extra Vietnamese paragraph appears above the Listen button, and the official English block is still present and unchanged.

- [ ] **Step 6: Commit**

```bash
git add app/api/simplify/route.ts components/useSimplifiedAdvice.ts components/WarningCard.tsx .env.example
git commit -m "Add optional Claude plain-language layer with silent fallback"
```

---

### Task 24: Full verification and deploy

**Files:**
- Create: `README.md`
- Modify: none

**Interfaces:**
- Consumes: every prior task
- Produces: a deployed HTTPS URL

- [ ] **Step 1: Run the full test suite**

```bash
npm test
```

Expected: every test green. Do not proceed past a failure.

- [ ] **Step 2: Typecheck and build**

```bash
npx tsc --noEmit && npm run build
```

Expected: no type errors, and a successful production build.

- [ ] **Step 3: Walk the demo end to end**

```bash
npm start
```

Run through the exact sequence you will perform for judges, in each of the four languages:

- Open `/?demo=1` on a fresh profile and confirm the scenario anchors to Katoomba with no setup
- Confirm the simulated-data banner is visible at every step
- Press Play and confirm all three escalation steps render
- Press a numbered step button and confirm it jumps immediately
- Press Listen and confirm speech in the selected language, or the plain "cannot read this language" message
- Tap Get help and confirm the service ordering changes with the profile
- Switch to Hindi and confirm Devanagari renders as text rather than boxes

- [ ] **Step 4: Check the accessibility basics**

In devtools, with the app open:

- Set large text and confirm nothing overlaps or clips at 1.35 scale
- Set the viewport to 320px wide and confirm no horizontal scrolling
- Tab through the whole page and confirm every control shows a visible focus ring
- Confirm every alert level is distinguishable in a greyscale filter, using shape and word

- [ ] **Step 5: Write the README**

`README.md`:

```markdown
# SafeSignal

Official NSW bushfire warnings, made understandable.

SafeSignal takes the public NSW RFS warning feed and presents it in plain
language, in English, Mandarin, Hindi, and Vietnamese, with speech, large
text, and a profile-aware help layer.

SafeSignal does not create emergency advice. The official warning stays the
source of truth, and the exact official English wording is shown on every
warning alongside the plain-language version.

## Running it

    npm install
    npm run dev

Demo mode, which does not need any live warnings to exist:

    http://localhost:3000/?demo=1

## Configuration

`ANTHROPIC_API_KEY` is optional. Without it, SafeSignal renders from its own
translated phrase packs and shows official advice in English. Nothing breaks.

## Privacy

Location, mobility, transport, and language preferences are stored in the
browser and are never sent anywhere. The warnings API takes no parameters.

## Design and plan

- `docs/superpowers/specs/2026-08-29-safesignal-design.md`
- `docs/superpowers/plans/2026-08-29-safesignal.md`
```

- [ ] **Step 6: Deploy**

```bash
npx vercel --prod
```

Set `ANTHROPIC_API_KEY` in the Vercel project settings if you are using the Claude layer.

- [ ] **Step 7: Verify the deployed URL on a real phone**

Open the deployed `/?demo=1` on an actual phone, not a simulator. Confirm the install prompt, the speech, and the tap-to-call links, since `tel:` links and speech voices behave differently on real devices.

- [ ] **Step 8: Commit**

```bash
git add README.md
git commit -m "Add README and verify full build"
```

---

## Self-Review

**Spec coverage.** Every spec section maps to a task: problem and framing to the README in Task 24; scope to the whole plan; architecture and the `WarningSource` seam to Tasks 10 and 11; domain model to Tasks 2 through 5; server API to Tasks 6 and 23; accessibility layer to Tasks 12, 13, 14, and 18; demo mode including `?demo=1` and the Blue Mountains default to Tasks 11 and 20; the four help features to Tasks 15, 16, 17, and 21; failure behaviour to Tasks 6, 10, 14, 22, and 23; testing to every task's test steps; build order to the task order itself.

**Deviations from the spec, all deliberate:**

1. `updatedAt` and `publishedAt` are `Date | null` rather than `Date`, following the spec's own rule that missing fields become null.
2. A `WarningWire` type and `toWire`/`fromWire` were added, because `Warning` holds `Date` objects and crosses the network as JSON.
3. `fromSydneyWallTime` was added. The spec identified the day-first parsing trap but not that RFS timestamps are Sydney wall time, which would render every timestamp ten or eleven hours out on a UTC server.
4. The action checklist derives from the warning's own `rawAdvice` rather than from a per-level table of translated steps. This is strictly more faithful to the "creates no emergency advice" constraint, and it removes about sixty hand-written strings.
5. NSW SES and the National Relay Service are in the service directory; a per-council transport line is not, because no single verifiable number exists for it. Service NSW covers that need instead.
6. The warning source lives in a `WarningProvider` at the layout rather than in a per-page hook. Self-review caught that two pages each calling their own hook would each build their own `DemoSource`, so tapping from the warning screen to the help screen mid-demo would restart the scenario at step one, drop `?demo=1`, and silently return the presenter to live mode. Task 21 now verifies this explicitly.

**Known gaps, stated rather than hidden:**

- Speech and the service worker have no automated tests. Both are thin wrappers over browser APIs whose behaviour differs per device, so they are verified manually in Tasks 20, 22, and 24.
- The UI has no component tests, per the spec's explicit decision.
- Translations are written by the implementer, not a native speaker. Task 12 flags the eight sentences worth checking before the demo.
