# SafeSignal Design

**Date:** 2026-08-29
**Status:** Approved, ready for implementation planning
**Context:** 24-hour hackathon build

## 1. Problem

Emergency warnings in Australia are not equally accessible to everyone.

NSW already runs capable systems: RFS warnings, Hazards Near Me, and AusAlert.
These systems reach people.
They do not guarantee that every person who receives a warning can understand it or act on it.

Older people, people with disabilities, people with low digital literacy, and people who are not confident in English can receive a warning and still be stuck.
The concrete scenario driving this design is an older Mandarin-speaking wheelchair user with no car.
They receive a bushfire warning, cannot read the English text confidently, and do not know who to call to get help evacuating.

The gap is not delivery.
The gap is comprehension and next action.

## 2. What SafeSignal is, and is not

SafeSignal is a mobile-first progressive web app that makes official NSW bushfire warnings understandable and actionable.

SafeSignal does not create new emergency advice.
The official government warning remains the source of truth.
Every screen shows the plain-language rendering alongside the exact official English wording, labelled as official, with a link to the RFS page.

This constraint is load-bearing.
It is what separates SafeSignal from an app that invents emergency guidance, and it must survive every implementation decision.

## 3. Scope for the 24-hour build

In scope:

- NSW bushfires only, via the public NSW RFS GeoJSON feed
- Five languages: English, Mandarin (Simplified), Arabic, Vietnamese, Greek
- Location matching against the user's stated or detected location
- Text-to-speech in the selected language
- Large-text mode
- A help layer: filtered service directory, English call script, share-my-situation, official action checklist
- Live mode and demo mode
- Offline capability via service worker

Out of scope:

- Flood, storm, and other hazard types
- Push notifications
- User accounts, servers holding user data, any database
- Native app packaging
- Geocoding API integration

## 4. Architecture

### 4.1 Stack

Next.js (App Router) deployed on Vercel, as a PWA.

Two reasons drive this choice.
API routes solve the CORS problem and give the Claude API key a home that is not the browser.
Vercel produces a real HTTPS URL that judges can open on their own phones, which matters for a mobile-first accessibility pitch.

### 4.2 The central seam

The entire system hangs off one interface:

```ts
interface WarningSource {
  subscribe(onWarnings: (warnings: Warning[]) => void): () => void
}
```

There are exactly two implementations.

`LiveSource` polls `/api/warnings` every 60 seconds.
`DemoSource` runs a scripted escalation from a local fixture on a timer.

Nothing downstream knows which one it is talking to.

This seam does three things at once.
It makes demo mode exercise the real application rather than a parallel fake.
It makes the whole app testable without a network.
It gives demo data a single, clean injection point.

### 4.3 Where processing happens

The server owns exactly two responsibilities: the CORS-blocked fetch, and custody of the Claude API key.

It normalizes the messy RFS payload into clean `Warning` objects and returns them.
`/api/warnings` accepts no parameters and returns every current NSW warning.

Everything downstream happens in the browser: matching against the user's location, language selection, phrase template filling, speech, and call-script generation.

The user's location, mobility status, transport situation, and language preference never leave the device.
This is a deliberate design property, not an accident of implementation.
For this user group in particular, the privacy claim needs to be literally true, and it also means the app keeps working when the network does not.

### 4.4 Module map

```
safesignal/
  app/
    api/warnings/route.ts     server-only: fetch RFS, parse, normalize, 30s cache
    api/simplify/route.ts     server-only: Claude rewrite, key never leaves here
    setup/page.tsx            first-run preferences wizard
    page.tsx                  main warning screen
  lib/
    rfs/          fetch.ts  parse.ts  normalize.ts
    domain/       warning.ts  profile.ts  match.ts
    sources/      live.ts  demo.ts  types.ts
    i18n/         phrases/{en,zh,ar,vi,el}.ts  render.ts
    speech/       tts.ts
    help/         services.ts  callScript.ts
  components/
  public/
    manifest.json
    demo-audio/
```

## 5. Domain model

### 5.1 Warning

`Warning` is the contract between server and client.

```ts
type AlertLevel =
  | 'emergency-warning'
  | 'watch-and-act'
  | 'advice'
  | 'not-applicable'
  | 'planned-burn'

interface Warning {
  id: string
  level: AlertLevel
  title: string
  location: string
  council: string
  status: string
  type: string
  sizeHa: number | null
  agency: string
  updatedAt: Date
  publishedAt: Date
  point: { lat: number; lon: number } | null
  polygons: Polygon[]
  officialUrl: string
  rawAdvice: string | null
}
```

### 5.2 Feed shape and parsing

The feed lives at `https://www.rfs.nsw.gov.au/feeds/majorIncidents.json`.

It returns a GeoJSON `FeatureCollection`.
Feature properties are flat: `title`, `link`, `category`, `guid`, `guid_isPermaLink`, `pubDate`, `description`.
`category` carries the alert level.
Geometry is either a `Point` or a `GeometryCollection` mixing a point with polygons.

The `description` value is not prose.
It is a set of `KEY: value` pairs separated by literal `<br />` markers, covering ALERT LEVEL, LOCATION, COUNCIL AREA, STATUS, TYPE, FIRE, SIZE, RESPONSIBLE AGENCY, and UPDATED.

The parser splits on the break marker and reads key/value pairs.

It is written defensively.
Unknown keys are ignored rather than rejected, because the RFS can add fields without warning.
Missing keys become `null`.
A feature that cannot be parsed is dropped and counted rather than throwing.
One malformed feature must never blank the screen during a bushfire.

### 5.3 Date parsing

Two different date formats appear, and both need explicit parsers with tests.

The `pubDate` field is day-first, in the form `29/08/2026 4:12:00 AM`.
Passing that string to `new Date()` silently yields 8 September, because JavaScript interprets it as US month-first.
This is a real defect waiting to happen and it would surface as wrong timestamps on stage.

The `UPDATED` field uses a different format again, in the form `29 Aug 2026 14:12`.

### 5.4 Matching

Matching runs entirely in the browser.

If a warning carries polygons, we run a point-in-polygon test against the user's location.
Otherwise we fall back to haversine distance from the incident point.

Relevance bands are level-dependent, because a distant emergency warning still matters and a distant planned burn does not:

- Emergency Warning: surfaced within 50km
- Watch and Act: surfaced within 30km
- Advice: surfaced within 20km
- Planned Burn: surfaced within 10km
- Not Applicable: never surfaced as a warning

The `not-applicable` case needs stating explicitly because it dominates the feed.
On the 2026-08-29 snapshot it was 41 of 53 features.
These are recorded incidents that carry no alert level, so presenting them as warnings would bury the real ones and train users to ignore the app.
They are parsed and retained in the payload, but the matcher never promotes them to the warning list.

Results sort by severity first, then by distance.

### 5.5 User profile

```ts
interface UserProfile {
  location: { lat: number; lon: number; label: string } | null
  language: 'en' | 'zh' | 'ar' | 'vi' | 'el'
  mobility: 'none' | 'limited-walking' | 'wheelchair' | 'bedbound'
  transport: 'own-car' | 'can-get-lift' | 'no-transport'
  largeText: boolean
  audio: boolean
}
```

The profile lives in `localStorage` and is never transmitted.

### 5.6 Location acquisition

Browser geolocation is the happy path.

Manual entry is a first-class path, not a fallback.
A significant share of this exact user group will deny the permission prompt or not understand what it is asking.

Manual entry is backed by a bundled list of NSW town and suburb centroids.
No geocoding API, no network dependency, no key.

## 6. Server API

### 6.1 GET /api/warnings

Takes no parameters.
Fetches the RFS feed, parses, normalizes, and returns an array of `Warning`.
Caches for 30 seconds, matching the cache lifetime the feed declares for itself.
On upstream failure, returns the last good cached payload with a staleness timestamp.

### 6.2 POST /api/simplify

Accepts warning text, alert level, and target language.
Returns a plain-language rewrite produced by Claude.

This endpoint is a bonus layer and never a dependency.
Every caller must render correctly when it is unavailable.

## 7. Accessibility layer

### 7.1 Language set

English, Mandarin (Simplified), Arabic, Vietnamese, Greek.

The set is drawn from NSW community language data.
Arabic is included deliberately because it forces correct right-to-left layout.
An app that only ever handles left-to-right languages has not actually solved the problem.

### 7.2 Phrase pack

The phrase pack is structured around what a person needs to know, not around a flat string table:

```ts
interface PhrasePack {
  levelName:    Record<AlertLevel, string>
  levelMeaning: Record<AlertLevel, string>
  levelAction:  Record<AlertLevel, string>
  statusValues: Record<string, string>
  typeValues:   Record<string, string>
  fields: {
    location: string; council: string; status: string
    size: string; updated: string; agency: string
  }
  ui: Record<UIKey, string>
}
```

The split between `levelName` and `levelMeaning` is the core accessibility insight of the product.

"Watch and Act" is meaningless to someone who has not absorbed Australian emergency conventions.
"A fire is close. Get ready to leave now." is not.

SafeSignal shows both.

### 7.3 Two-tier presentation

Every warning screen shows two tiers.

The plain-language rendering appears first and large.
The exact official English wording appears underneath, labelled as the official wording, linked to the RFS page.

This is how the app stays understandable while keeping the official warning as the source of truth.

### 7.4 Speech

Uses the browser `speechSynthesis` API.
No key, no cost, no network.

Three implementation details are easy to get wrong and must be handled.

Voices load asynchronously in Chrome, so the first `getVoices()` call returns an empty array.
The implementation must wait on the `voiceschanged` event.

Speech rate is set to roughly 0.9 rather than 1.0.
Comprehension matters more than speed for this audience.

When no voice exists for the selected language on that device, the app says so plainly rather than failing silently.
Pre-generated audio files ship for the demo scenario as a stage backstop.

### 7.5 Large text and visual design

Large text is a type scale, not a font-size bump.

A root `data-text-size` attribute drives CSS custom properties that scale the whole type ramp together.
Tap targets grow from 44px to 56px alongside it, because large-text users generally also want larger touch targets.

Alert levels are never signalled by colour alone.
Every level carries a colour, an icon, and a word.
This survives colour blindness and a bright outdoor phone screen.

## 8. Demo mode

### 8.1 Rationale

The live feed currently contains no Emergency Warnings.
A snapshot taken on 2026-08-29 showed 53 features: 4 Advice, 8 Planned Burn, 41 Not Applicable.
It is late winter and the season is quiet.

Demo mode is therefore the primary presentation surface, not a fallback.

### 8.2 Engine

```ts
interface ScenarioStep {
  atMs: number
  warnings: Warning[]
}
```

`DemoSource` implements `WarningSource` and emits scripted steps on a timer.

### 8.3 Entry

Demo mode is entered two ways.

A labelled toggle in settings covers normal use.
A `?demo=1` URL parameter covers the case that actually matters at a hackathon, where a judge opens the link on their own phone and must reach the scenario without being walked through a settings screen.

### 8.4 Scenario

The scenario is anchored on the user's profile location when one is set.

When no location is set, it falls back to a fixed default in the Blue Mountains, so demo mode works on a first-run device with no setup and no geolocation permission.
This matters because a judge opening the link cold is the most likely way the demo is ever seen.

A fire escalates near that anchor location:

1. Advice, under control, 8km away
2. Watch and Act, out of control, 5km away
3. Emergency Warning, out of control, 2km away, fire front approaching

At each step the app reacts visibly, re-speaks in the selected language, and re-sorts the help options as the situation worsens.

### 8.5 Presenter controls

Play, pause, and a step scrubber.

Pause lets a presenter talk over a state.
The scrubber lets a presenter jump straight to the Emergency Warning if the demo is running long.
Demos die from dead air.

### 8.6 Labelling

Demo mode carries a permanent, unmissable banner stating that the data is simulated.

For an emergency application this is an ethics requirement, not a nicety.

## 9. Help layer

### 9.1 Service directory

Entries carry a `showWhen(profile, warning)` predicate and are ordered by relevance to the user.

Entries include Triple Zero, NSW RFS, TIS National on 131 450 for a free interpreter, SES, and council disability transport.

A wheelchair user with no car sees transport first.
A Mandarin speaker sees the interpreter line first.
Same data, different order, driven entirely by the profile.

### 9.2 English call script

This is the feature that most directly resolves the problem statement.

The user taps what they need.
They receive an English script to read aloud or show the operator, with their own language displayed alongside so they know what they are saying.
A large tap-to-call button sits next to it.

### 9.3 Share my situation

Composes a message containing location, current warning, and stated needs.
Hands it to the Web Share API, with an SMS link fallback.

### 9.4 Action checklist

Every item derives verbatim from the official RFS advice text for that alert level.
Each item is tagged with its source.
Nothing is invented.

This constraint exists because a generated checklist is the most likely place for SafeSignal to appear to be creating emergency advice.
If time runs short, this is the first feature to cut.

## 10. Failure behaviour

The governing rule: SafeSignal never shows a blank screen and never shows an error page.

Every failure degrades into something still useful.
Every screen always states how fresh its data is.
For an emergency app, silent staleness is more dangerous than a visible error, so the timestamp is never optional.

| Failure | Behaviour |
|---|---|
| Feed unreachable | Serve last good cached payload behind an "as of HH:MM" label |
| Feed malformed | Drop unparseable features, count them, render the rest |
| Claude unavailable or no key | Fall back to phrase-pack rendering, no visible break |
| Geolocation denied | Manual entry appears immediately, no dead end |
| No voice for language | State it plainly; demo audio as backstop |
| Offline | Service worker serves shell, phrase packs, last warnings, with a banner |

## 11. Testing

Vitest.
Tests target what breaks silently.

The feed parser receives the most coverage: the day-first date trap, malformed descriptions, missing fields, unknown keys.

The matcher covers point-in-polygon, haversine distance, and the banding thresholds.

The renderer gets a phrase pack completeness test asserting that all five languages define every key.
This is cheap and it catches the classic demo failure where the Arabic build renders `undefined` on stage.

The demo engine gets timing and ordering tests.

Component snapshot tests and end-to-end tests are not worth the hours available.

## 12. Build order

Sequenced so the risky work happens while the team is fresh.

1. Scaffold, then `/api/warnings` with parsing and normalization, tests first
2. Domain matching, profile, localStorage
3. Setup wizard and main warning screen, English only
4. The `WarningSource` seam, `LiveSource`, `DemoSource`, the scenario
5. Phrase packs, rendering, language switching, right-to-left
6. Speech and large text
7. Help layer: directory, then call script, then share, then checklist
8. PWA manifest, service worker, offline
9. The Claude simplify layer
10. Deploy and polish

Claude enters at step nine deliberately.
It is the only piece the app does not need, so it is the only piece that can be cut without a rewrite.
Everything before it stands alone.

## 13. Risks

The RFS feed sends no `Access-Control-Allow-Origin` header.
A browser-only build is impossible.
This is already resolved by the server proxy, and is recorded here so nobody tries to remove it.

Text-to-speech voice availability varies by device.
An unfamiliar demo phone may lack a Mandarin or Arabic voice.
Mitigated by runtime voice detection and pre-generated demo audio.

Translation quality in the phrase packs is only as good as the translations written into them.
Where possible, wording should be checked against existing official multilingual emergency material rather than produced fresh.
