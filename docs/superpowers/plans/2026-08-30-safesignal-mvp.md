# SafeSignal — Target MVP Architecture

**Date:** 2026-08-30
**Status:** Design. Not implemented. Awaiting approval.
**Supersedes:** nothing. Extends `specs/2026-08-29-safesignal-design.md`.
**Basis:** the 2026-08-30 codebase audit, including a live query of the NSW RFS feed.

---

# 0. THE INVARIANT

> **The user profile may influence HOW information is presented.**
> **The user profile must NEVER alter the meaning, severity, or official advice.**

Everything below is arranged to make violating this *structurally difficult*, not merely discouraged.

## 0.1 Why a convention is not enough

Today `WarningCard.tsx` receives `relevant.warning` — the canonical object — and calls `renderWarning(relevant, profile.language)` itself. A component holding both the canonical warning and the profile can trivially branch on the profile to change what the warning says. Nothing stops it. Nothing tests for it.

## 0.2 Three enforcement mechanisms

**1. Type separation.** Two distinct types, and the boundary is one-way.

```
CanonicalWarning        profile-independent, immutable, from RFS
       │
       ├─ severityOf(CanonicalWarning) -> AlertLevel        ← takes NO profile
       ├─ officialTextOf(CanonicalWarning) -> string        ← takes NO profile
       │
       └─ present(CanonicalWarning, Relevance, Profile) -> Presentation
```

`severityOf` and `officialTextOf` **do not accept a `UserProfile` parameter.** Not "should not" — cannot. A future contributor who wants profile-dependent severity has to change a function signature, which is a visible, reviewable act rather than a quiet one-line branch.

**2. Components never see `CanonicalWarning`.** React components accept `Presentation` only. The canonical object stops at the presentation boundary. This is the single largest structural change from today's code.

**3. A property test that proves the invariant.** For the cross-product of every warning fixture × every possible profile:

```
∀ w, ∀ p₁, p₂ :  present(w, r, p₁).level        === present(w, r, p₂).level
                 present(w, r, p₁).officialText === present(w, r, p₂).officialText
                 present(w, r, p₁).level        === w.level
```

With 4 languages × 4 mobilities × 3 transports × 2 large-text × 2 audio = **192 profiles**, run against every fixture. This test *is* the safety claim, and it is worth stating in the pitch.

## 0.3 The permission table

Exhaustive. Anything not listed as "may affect" must not be affected.

| Preference | May affect | Must never affect |
|---|---|---|
| Language | Which phrase pack renders the plain-language tier; speech locale; assistance descriptions | Alert level, official English text, which warnings are shown |
| Large text | Type scale, tap-target size, spacing | Content, wording, ordering of warnings |
| Audio | Whether speech plays, whether escalation is spoken | Any text on screen |
| Mobility | Ranking and content of the **assistance** layer; call-script lines | The warning, its level, its official advice |
| Transport | Ranking of assistance; call-script lines | The warning, its level, its official advice |
| Location | Which warnings are relevant, distance text | The level or wording of any warning shown |

## 0.4 The tension we are deliberately not resolving

A wheelchair user with no transport plausibly needs **more lead time** than a driver. It is tempting to widen their matching radius.

**We will not do this.** Widening the radius by profile means two users standing in the same room see different warnings for the same fire — which is exactly the meaning-alteration the invariant forbids, and it would make the app's output unverifiable against the official source.

Instead, lead-time need is surfaced in the **assistance layer**, which is allowed to be profile-aware: the same warning, with an earlier and more prominent "arranging transport takes time — start now" pathway. Same meaning, different help.

This decision should be said out loud to judges. It demonstrates that the constraint was understood rather than accidentally satisfied.

---

# 1. COMPONENT ARCHITECTURE

## 1.1 Layers

```
┌─ SERVER ─────────────────────────────────────────────────────┐
│  Ingestion    fetch (timeout) → validate → normalize          │
│               retains verbatim rawDescription                 │
│  Derivation   structured fields → DerivedAdvice (labelled)    │
│  Distribution GET /api/warnings   (no parameters, ever)       │
│  Translation  POST /api/translate (capped, rate-limited)      │
└───────────────────────────────────────────────────────────────┘
                            │  CanonicalWarning[]
┌─ CLIENT ─────────────────────────────────────────────────────┐
│  Source seam  WarningSource: LiveSource | DemoSource          │
│  Lifecycle    WarningStore — diffing, escalation, resolution  │
│  Relevance    match(canonical[], location) → Relevant[]       │
│               ── PROFILE-FREE BOUNDARY ──                     │
│  Presentation present(Relevant, Profile) → Presentation       │
│  Assistance   assist(Relevant, Profile) → AssistancePlan      │
│  Render       components consume Presentation only            │
└───────────────────────────────────────────────────────────────┘
```

The dashed line is the invariant boundary. Above it, no code accepts a `UserProfile`. Below it, no code returns an `AlertLevel` it did not receive.

## 1.2 Module map

```
lib/
  rfs/          fetch  validate  normalize  derive   parse  time
  domain/       warning  relevance  geo  lifecycle
  profile/      model  storage  directives
  present/      present  phrases/{en,zh,hi,vi}  provenance
  assist/       services  callScript  checklist  share
  sources/      types  live  demo  scenario
  speech/       tts  queue
components/
  providers/    ProfileProvider  WarningProvider  AnnouncerProvider
  surface/      AlertSurface  LevelBadge  FreshnessBar  DemoBanner
  warning/      WarningHeadline  WarningAction  OfficialDisclosure
  assist/       ServiceCard  CallScriptPanel  Checklist  ShareButton
  a11y/         LiveRegion  SkipLink  TextSizeToggle
  setup/        LanguageStep  LocationStep  NeedsStep  PreferencesStep
```

## 1.3 Components to add

| Component | Purpose | Fixes |
|---|---|---|
| **AlertSurface** | Whole screen responds to level — background, border, spine colour | Emergency and Advice currently look 95% identical |
| **LiveRegion** | `aria-live="assertive"` announcement on level change | Escalation is currently silent to screen readers |
| **WarningHeadline / WarningAction** | Splits *what is happening* from *what you must do* | Four sibling `<p>` at identical weight today |
| **OfficialDisclosure** | Styled, provenance-labelled official block | Unstyled native `<details>` |
| **FreshnessBar** | Graded freshness, not binary stale | `stale` is boolean today |
| **SkipLink / TextSizeToggle** | Missing landmarks; language and size only changeable via full setup |
| **AnnouncerProvider** | Owns the live region and speech queue | Escalation logic is implicit in a `useEffect` today |

## 1.4 Components to refactor

`WarningCard` splits into the three warning components and stops receiving `CanonicalWarning`. `page.tsx` stops calling `renderWarning` and `matchWarnings` inline. `DemoControls` gains accessible names — its buttons are currently labelled `1 2 3`.

---

# 2. DATA MODEL

## 2.1 Provenance — the safety spine

Every string that reaches the screen carries where it came from, and the UI renders that.

```ts
type Provenance =
  | 'rfs-verbatim'      // exact bytes from the RFS feed
  | 'rfs-derived'       // mechanically derived from RFS structured fields
  | 'safesignal-phrase' // human-written, human-translated, in-repo
  | 'ai-translation'    // machine translation OF rfs-verbatim text only

interface Attributed { text: string; provenance: Provenance; lang: string }
```

Rules the type system and review enforce:

- `ai-translation` may only ever wrap text whose source was `rfs-verbatim`. **AI never translates a phrase pack** — those are already human-translated — and **AI never generates advice**.
- `ai-translation` is always displayed with its English original adjacent, never replacing it.
- `rfs-derived` must never be presented as RFS prose. It is labelled as SafeSignal's reading of official fields.

## 2.2 CanonicalWarning

```ts
interface CanonicalWarning {
  id: string
  level: AlertLevel
  fields: Record<string, string>   // ALL parsed fields, no whitelist
  rawDescription: string           // NEW — verbatim, never dropped
  location: string; council: string; status: string; type: string
  sizeHa: number | null; agency: string
  updatedAt: Date | null; publishedAt: Date | null
  point: LatLon | null; polygons: PolygonRing[]
  officialUrl: string
  officialAdvice: Attributed | null   // rfs-verbatim when present
  derivedAdvice: Attributed           // rfs-derived, always present
  ingestedAt: Date
}
```

Two changes matter. `rawDescription` means the official wording is genuinely verbatim rather than reconstructed — the audit found today's `buildOfficialText` rebuilds from a **fixed whitelist that silently drops the `FIRE` field**. And `fields` holding everything means a new RFS field appears rather than vanishes.

## 2.3 Relevance and Presentation

```ts
interface Relevance { distanceKm: number | null; inside: boolean; band: Band }

interface Presentation {
  level: AlertLevel                  // === canonical.level. Asserted by test
  levelName: Attributed              // official label
  meaning: Attributed                // what it means, plain
  action: Attributed                 // what to do
  place: string
  proximity: Attributed | null
  official: Attributed               // rfs-verbatim
  officialTranslation: Attributed | null   // ai-translation, adjacent
  officialUrl: string
  speech: { text: string; locale: string } | null
  freshness: Freshness
}
```

`Presentation` carries no `UserProfile` reference and no canonical object. Once built, a component cannot reach back to re-derive meaning.

## 2.4 Profile and directives

`UserProfile` stays as today (it is well built and defensively parsed). It gains nothing. What changes is that it is converted once into:

```ts
interface PresentationDirectives {
  language: LanguageCode; speechLocale: string
  textScale: 'normal' | 'large'
  speakOnEscalation: boolean
  reduceMotion: boolean          // from media query, NOT stored preference
}
```

Components receive `PresentationDirectives`, never `UserProfile`. Mobility and transport are structurally unable to reach the warning renderer — they exist only in the assistance layer.

---

# 3. API ARCHITECTURE

## 3.1 GET /api/warnings

Unchanged in contract, hardened in behaviour. **Takes no parameters. This is load-bearing and must never be relaxed.**

| Concern | Design |
|---|---|
| Timeout | 8s `AbortSignal.timeout` on the upstream fetch. Today there is none, anywhere |
| Caching | 30s in-memory + last-good snapshot that survives upstream failure |
| Conditional | `ETag` on the payload hash; client sends `If-None-Match`; 304 makes 60s polling nearly free |
| Status | Always 200. A stale payload beats an error during a fire |
| Body | `{ warnings, fetchedAt, stale, dropped, feedVersion }` |

## 3.2 POST /api/translate

Replaces `/api/simplify`. The audit found the current route is an **unauthenticated public proxy to the Anthropic API with unbounded input** — anyone who finds the URL can burn the key.

| Control | Value |
|---|---|
| Input cap | 2,000 characters, rejected above |
| Rate limit | 20 requests / IP / 5 min, in-memory counter, no persistence |
| Origin check | Same-origin `Origin` header required |
| Timeout | 10s |
| Model | `claude-sonnet-5` |
| Failure | Returns `{ text: null }`. Never an error status — the caller must treat absence as normal |
| Logging | **Request bodies are never logged** |

The system prompt keeps today's excellent constraints — translate only what is given, never add advice, never remove a safety instruction — and gains one: **refuse and return the input unchanged if asked to translate anything that is not an official warning.**

## 3.3 GET /api/health

New, trivial: feed reachability, last successful ingest, key presence as a boolean. Lets us verify the deployment before a demo without opening the app.

---

# 4. RFS FEED ARCHITECTURE

## 4.1 What the feed actually contains — verified 2026-08-30

Queried live. This is measured, not assumed.

```
https://www.rfs.nsw.gov.au/feeds/majorIncidents.json
50 features · geometry: GeometryCollection

description = 9 structured fields, joined by <br />:
ALERT LEVEL · LOCATION · COUNCIL AREA · STATUS · TYPE · FIRE · SIZE ·
RESPONSIBLE AGENCY · UPDATED

category distribution: Advice 4 · Planned Burn 8 · Not Applicable 38
                       Watch and Act 0 · Emergency Warning 0

link: identical generic "Fires Near Me" page on every one of the 50 features
```

**There is no free-text advice in this feed.** That is why `normalize.ts:98` hardcodes `rawAdvice: null`, and why the Claude layer, the official-advice checklist, and the verbatim advice block are all inert in live mode.

## 4.2 The four-stage pipeline

```
fetch ──▶ validate ──▶ normalize ──▶ derive
 8s        schema       canonical     labelled advice
 timeout   guard        + verbatim    rfs-derived
```

**Validate** is new. A feed that parses as JSON but has the wrong shape currently produces zero warnings silently. The validator distinguishes three outcomes: *valid*, *valid-with-drops* (count and surface), *structurally wrong* (keep last-good, mark stale, surface).

**Derive** is the honest answer to the audit's central problem.

## 4.3 Advice derivation — the honest fix

We cannot show official prose that does not exist. We can mechanically state what the official fields say, and label it as ours.

```
Input  : ALERT LEVEL=Watch and Act, STATUS=Out of control, TYPE=Bush Fire, SIZE=180 ha
Output : Attributed {
           text: "The NSW RFS has issued a Watch and Act for this bush fire.
                  The fire is not under control. It has burnt about 180 hectares."
           provenance: 'rfs-derived'
         }
```

Three rules, all testable:

1. **Every clause maps to exactly one feed field.** No clause exists without a field behind it. A property test asserts every derived sentence is traceable.
2. **No imperatives.** Derived text describes; it never instructs. Instruction comes only from `safesignal-phrase` (human-written per level, translated by humans) or `rfs-verbatim`.
3. **Always labelled on screen** as SafeSignal's reading of official fields, with the raw fields one tap away.

This makes the AI translation layer genuinely live — it now has `rfs-derived` and, when present, `rfs-verbatim` text to work on — without inventing emergency guidance.

> **Correction to my own audit.** I earlier suggested synthesising advice as the P0 fix. Refining it: derived text must be **non-imperative and separately labelled**. Telling someone what to do is the part that must never be machine-generated.

## 4.4 Official links

Every feed link is the same generic page. `officialUrl` therefore keeps that page but the UI must **not** claim it is this warning's page — label it "Open the official NSW RFS fire map", which is what it actually is.

`UNKNOWN — VERIFY`: whether Emergency Warning incidents receive distinct per-incident URLs. None were active on 2026-08-30, so this could not be checked. If they do, prefer them.

## 4.5 Feed limitations to state plainly

| Limitation | Consequence | Response |
|---|---|---|
| No prose advice | AI layer has thin real input | Derivation (4.3), labelled |
| No movement/direction data | Cannot say which way a fire is heading | **Do not invent it.** No "moving towards you" |
| Poll-only, 60s + 30s cache | Up to ~90s stale | Graded freshness, always visible |
| Generic links | Cannot deep-link a warning | Honest labelling |
| Today: no severe levels | Live mode shows Advice at best | Demo mode carries the escalation, banner-labelled |

---

# 5. GEOSPATIAL MATCHING

## 5.1 Profile independence

`match(warnings, location)` takes **no profile**. Two people in the same room see the same warnings. This is the invariant's sharpest edge — see §0.4 for the lead-time tension and why we resolve it in the assistance layer instead.

## 5.2 Algorithm

Unchanged in shape from today's `match.ts`, which is sound.

```
for each warning:
  skip if level is not-applicable
  if location unknown or warning has no point → band 'unknown', include
  inside   = pointInAnyPolygon(location, polygons)
  distance = haversineKm(location, point)
  include if inside OR distance <= RADIUS[level]

sort: severity desc → inside first → distance asc
```

Radii stay keyed on **level only**: Emergency 50 km, Watch and Act 30, Advice 20, Planned Burn 10.

## 5.3 Changes

- **Require a location before setup completes.** Today setup can finish with `location: null`, and the fallback shows every surfaceable warning in NSW. That is not a useful screen.
- Add polygon **hole** handling (even-odd across all rings). Currently only outer rings are modelled. P2 — the feed's polygons are simple.
- Add a `matchedAt` timestamp so relevance can be shown as a decision with a time, supporting the trust story.
- Guard antimeridian and degenerate rings in tests. Not a NSW risk, but cheap.

---

# 6. WARNING LIFECYCLE

Today the lifecycle is implicit — a `useEffect` in `page.tsx` keyed on `topId`/`topLevel`. Escalation is inferred as a side effect of a re-render. This becomes an explicit, testable store.

## 6.1 States

```
     ingested → validated ─┬─▶ rejected (counted, surfaced as "dropped")
                           └─▶ canonical
canonical ─┬─▶ matched ──▶ presented ─┬─▶ escalated  (level increased)
           │                          ├─▶ downgraded (level decreased)
           │                          ├─▶ updated    (fields changed, level same)
           │                          └─▶ resolved   (absent from feed)
           └─▶ unmatched (out of radius)
```

## 6.2 The diff engine

`WarningStore` holds the previous snapshot and emits events:

```ts
type WarningEvent =
  | { kind: 'escalated';  id: string; from: AlertLevel; to: AlertLevel }
  | { kind: 'downgraded'; id: string; from: AlertLevel; to: AlertLevel }
  | { kind: 'updated';    id: string }
  | { kind: 'resolved';   id: string; lastLevel: AlertLevel }
  | { kind: 'appeared';   id: string; level: AlertLevel }
```

One event stream drives four consumers that are currently uncoordinated or missing:

| Consumer | Behaviour |
|---|---|
| `LiveRegion` | `assertive` on escalate/appear, `polite` on update/resolve. **Currently missing entirely** |
| Speech queue | Re-speaks on escalate only, never on a poll tick |
| AlertSurface | Runs the escalation transition |
| FreshnessBar | Marks the moment of last change |

**`resolved` is unhandled today** — a warning that leaves the feed simply vanishes from the screen with no acknowledgement. For an emergency product that is a real gap: the user deserves to be told a fire near them is no longer listed, not to have it silently disappear.

## 6.3 Escalation as the WOW moment

Advice → Watch and Act → Emergency Warning must be *felt*:

1. Whole-surface colour transition to the new level (~600ms, transform/opacity only)
2. The level badge settles last
3. Simultaneous `aria-live` assertive announcement
4. Speech re-speaks if audio is on
5. Under `prefers-reduced-motion`: **no movement, instant swap, plus a persistent "Warning level changed" notice that does not auto-dismiss** — the information survives, the motion does not

That last point matters. Reduced-motion must not mean reduced information.

---

# 7. ACCESSIBILITY PREFERENCE MODEL

## 7.1 Preference → directive

`UserProfile` is captured once at setup. `PresentationDirectives` is derived per render. Components see only directives.

```
UserProfile ──▶ toDirectives(profile, mediaQueries) ──▶ PresentationDirectives
                       │                                        │
                       └── mobility, transport ────────▶ AssistanceContext
```

Mobility and transport are routed to the assistance layer and **are not present in `PresentationDirectives` at all** — the warning renderer literally cannot see them.

## 7.2 Additions

| Capability | Design |
|---|---|
| Reduced motion | Media query at render, not a stored preference. Respecting the OS is more reliable than asking |
| Text size toggle | Reachable from the main screen, not only from full setup |
| Language switcher | Same. Changing language should not require re-answering mobility questions |
| High contrast | `prefers-contrast: more` → stronger borders, heavier weights |
| Skip link | To main content. Missing today |
| `lang` at first paint | Currently `<html lang="en">` is static and corrected in an effect, so first paint mislabels the document for screen readers. Set from a cookie mirror of the stored language so SSR emits it correctly |

## 7.3 Contrast — measured, and a CI gate

Audit findings, measured:

| Token pair | Now | Target |
|---|---:|---:|
| Watch and Act badge, white on `#e35205` | **3.84:1** | ≥4.5:1 |
| `--line #d6dbe2` on white (form borders) | **1.39:1** | ≥3:1 |
| `.muted` on white | 6.39:1 | ≥7:1 |

Resolution: **dark ink on the official orange (4.72:1)** rather than darkening the orange. Official RFS colour fidelity is the thing we cannot buy back, and per-level ink is already a variable — `--level-advice-ink` is dark today.

`--line` → `#8b95a6` (3.02:1). `--ink-muted` darkened to clear 7:1.

**A test computes every token pair's ratio from `globals.css` and fails the build below threshold.** Accessibility claims should be enforced by CI, not by memory.

## 7.4 Dark mode

Absent today, in an app for people evacuating at night. Full token set under `prefers-color-scheme: dark`, with alert colours **re-tuned for contrast on dark, not merely inverted** — the official hues must remain recognisable while the ink pairing changes.

---

# 8. TRANSLATION ARCHITECTURE

## 8.1 Three tiers, in strict precedence

| Tier | Source | Provenance | Offline | Used for |
|---|---|---|---|---|
| **1. Phrase packs** | Human-written, human-translated, in repo | `safesignal-phrase` | Yes | Level meaning, level action, status, type, all UI |
| **2. Vocabulary maps** | Fixed lookups keyed on raw RFS strings | `safesignal-phrase` | Yes | STATUS and TYPE values |
| **3. AI translation** | Claude, server-side | `ai-translation` | No | **Only** `rfs-verbatim` and `rfs-derived` free text |

Tier 1 always renders. Tier 3 is additive enrichment that appears when it can and is absent otherwise. **The app is fully usable with tier 3 permanently unavailable** — which is also its behaviour with no API key.

## 8.2 Hard rules

- AI never translates a phrase pack. Those are already human-translated; re-translating would degrade quality and introduce drift.
- AI never generates advice, only converts existing text between languages and registers.
- AI output is always shown **adjacent to** the English original, never replacing it.
- AI output always carries a visible `ai-translation` label.
- English users get tiers 1 and 2. Today `useSimplifiedAdvice.ts:18` returns early for English, meaning English speakers receive no plain-language simplification at all — the phrase packs cover this, so the behaviour is correct but the naming is misleading.

## 8.3 Fallback chain

```
rfs-verbatim exists? ──yes──▶ show verbatim (English)
                     │           └─▶ AI translate → show adjacent, labelled
                     │                 └─▶ fails → verbatim alone. No error shown
                     └──no───▶ show rfs-derived, labelled
                                 └─▶ AI translate → adjacent, labelled

always, above both: safesignal-phrase meaning + action in the user's language
```

The plain-language tier never depends on the network. That is the accessibility guarantee.

## 8.4 Translation quality

The design spec already flags this and it remains the honest weak point: pack quality equals the quality of the translations written into them. `UNKNOWN — VERIFY` — wording should be checked against existing official multilingual emergency material where it exists, rather than authored fresh. This is a legitimate pre-submission task and should not be skipped on the assumption that the current strings are correct.

---

# 9. TEXT-TO-SPEECH ARCHITECTURE

## 9.1 Keep

`lib/speech/tts.ts` is well built: async `voiceschanged` handling with a timeout, exact-then-base-language voice matching, rate 0.9, cancel-before-speak, honest capability reporting. No changes to the core.

## 9.2 Add — a speech queue owned by AnnouncerProvider

Speech is currently triggered from a `useEffect` in `page.tsx` and from `SpeakButton` independently. Two triggers, one synthesiser, no coordination.

```
AnnouncerProvider owns:
  - the only speechSynthesis caller
  - a priority queue: escalation > manual > update
  - cancellation on navigation and unmount
  - pause when the tab is hidden
```

## 9.3 What is spoken

Built from `Presentation.speech`, never from canonical text: **meaning → place → status → action**. Never the jargon label — "Watch and Act" spoken aloud to someone unfamiliar with the term conveys nothing. This is already the current design and it is correct.

## 9.4 Fallback ladder

```
voice for exact locale (zh-CN) → voice for base language (zh) →
pre-generated demo audio (demo mode only) → plain on-screen notice
```

The pre-generated audio is specified in the design spec but **not implemented**. It is the stage backstop for an unfamiliar demo device with no Mandarin or Hindi voice, and it is cheap insurance for the single most fragile part of a live demo.

---

# 10. PRIVACY MODEL

## 10.1 The claim

> Location, mobility, transport and language never leave the device.

It is currently **true by construction**: `/api/warnings` takes no parameters, so there is no channel. Preserve this absolutely.

## 10.2 Model

| Data | Where | Leaves device |
|---|---|---|
| Location, mobility, transport, language, text size, audio | `localStorage`, key `safesignal.profile.v1` | Never |
| Geolocation coordinates | Memory → localStorage | Never |
| Warning text sent to `/api/translate` | Request body | **Yes — official warning text only** |

## 10.3 The one honest caveat

`/api/translate` sends text to Anthropic. That text is official RFS warning content, never profile data — but the *request itself* reveals that someone is reading a warning in a given language. Mitigations: no request-body logging, no correlation identifier, no cookies on the route.

**Rate limiting creates a real tension.** IP-based limiting means touching an IP. Resolution: a coarse in-memory counter with a 5-minute window, never persisted, never logged. Stating this tension in the pitch is stronger than pretending it does not exist.

## 10.4 Additional commitments

No analytics. No third-party scripts. No cookies except an optional language mirror for correct SSR `lang` — which contains a two-letter code and nothing else. A CSP that forbids external origins, which is enforceable given there are no external assets.

---

# 11. ERROR HANDLING

## 11.1 Principles

1. **Never a blank screen and never an error page.** Degrade to less information, never to no information.
2. **Every screen states how fresh its data is.** Silent staleness is the dangerous failure.
3. **Absent enrichment is normal, not an error.** No API key is a supported configuration.
4. **A failure that changes what the user should do must be visible.** A failure that only removes polish must be silent.

## 11.2 Matrix

| Failure | Behaviour | User sees |
|---|---|---|
| RFS feed unreachable | Serve last-good | Last data + "as at HH:MM" + stale marker |
| RFS feed times out (>8s) | Same | Same |
| RFS returns non-JSON / wrong shape | Keep last-good, mark stale | Same, plus a validation notice |
| Some features unparseable | Drop, count, render rest | "N incidents could not be read" |
| **No warnings ever fetched** | Empty state | "We could not reach the official feed" — **not** "no warnings near you". These must never be confused |
| Anthropic unavailable / no key | Tier 1+2 rendering | Nothing. Silent by design |
| Translate rate-limited | Same | Nothing |
| Geolocation denied | Manual search, already on screen | Search box, no scolding |
| No voice for language | Notice replaces the button | "This device cannot read this language aloud" |
| Speech synthesis throws | Swallow, reset button | Button returns to idle |
| Offline | SW serves shell + last warnings | Offline banner + freshness |
| localStorage unavailable | In-memory profile | Silent. Preferences lost on reload |
| Corrupt stored profile | Merge over defaults | Silent, already implemented |

**The bolded row is a genuine current bug risk:** "no warnings near you" and "we could not reach the feed" are semantically opposite and must never render the same component.

---

# 12. OFFLINE AND STALE-DATA BEHAVIOUR

## 12.1 Graded freshness

`stale` is a boolean today. It becomes four states, always visible:

| State | Age | Presentation |
|---|---|---|
| `fresh` | < 2 min | "Updated HH:MM" |
| `aging` | 2–15 min | "Updated HH:MM" + subdued marker |
| `stale` | > 15 min | Prominent marker + "may be out of date" |
| `offline` | no connection | Banner + last-known time + "check official sources" |

At `stale` and `offline`, the official RFS phone number and map link are promoted — when we cannot be trusted, we should point at who can. That is the right instinct for an emergency product and it is also a strong pitch beat.

## 12.2 Service worker

Current strategy is sound (network-first with cache fallback, JSON fallback for the warnings route). Changes: version the cache on deploy so a new build is never pinned to a stale shell; never serve `/api/translate` from cache; precache the pre-generated demo audio.

## 12.3 What offline must still do

Render the last warning, at the right level, in the right language, at the right text size, with the correct assistance numbers and the call script — **all of which are local**. Offline degrades freshness only. This is a strong claim and it is achievable because tiers 1 and 2 need no network.

---

# 13. TESTING STRATEGY

## 13.1 The invariant test — the centrepiece

```
∀ warning fixture × ∀ 192 profiles (4 lang × 4 mobility × 3 transport × 2 text × 2 audio):
    present(w, r, p).level        === w.level
    present(w, r, p).official     === present(w, r, p₀).official   (byte-identical)
    match(warnings, loc) is identical for all p
```

This is the executable form of the product's safety claim. Worth naming in the pitch.

## 13.2 Layers

| Layer | Tool | Covers |
|---|---|---|
| Unit | Vitest (node) | Existing 150 tests — all pure functions. Keep |
| Invariant | Vitest | §13.1 |
| Contract | Vitest + saved fixture | A real feed snapshot; asserts the pipeline against actual RFS shape |
| Derivation | Vitest | Every derived clause traces to a field; no imperatives |
| Lifecycle | Vitest | Diff engine: escalate, downgrade, resolve, appear |
| Component | Vitest + jsdom + Testing Library | Providers, AlertSurface, LiveRegion. **Zero coverage today** |
| Contrast | Vitest | Parses `globals.css`, computes ratios, fails below threshold |
| Build | CI | `tsc --noEmit`, `next build` |

## 13.3 Manual matrix — cannot be automated in time

Real iOS Safari and Android Chrome. VoiceOver and TalkBack on the escalation. Large text at 1.35 on a 375px screen. All four languages for overflow, especially Hindi and Vietnamese. Aeroplane mode cold start. `prefers-reduced-motion`. Dark mode. A device with no Mandarin voice.

## 13.4 Explicitly not tested

Real RFS uptime. Anthropic quality. Cross-browser speech voice availability — detected at runtime instead.

---

# 14. DEMO MODE

## 14.1 Keep the seam

`WarningSource` with `LiveSource` and `DemoSource` is the best decision in the codebase. Demo exercises the real application. Preserve exactly.

## 14.2 Fix: the demo does not exercise the real app

`scenario.ts` builds warnings with `polygons: []`, so `pointInAnyPolygon` — and the entire "You are inside the fire area" path — is **never exercised in demo mode**. The seam's whole promise is that demo runs the real code. Add polygons, and make the final step place the user inside one.

## 14.3 Scenario

Anchored to the user's location, or Katoomba on a cold device.

| Step | At | Level | Distance | Notes |
|---|---|---|---|---|
| 1 | 0s | Advice | 8 km | Calm baseline |
| 2 | 15s | Watch and Act | 5 km | First escalation. Surface transition + announcement |
| 3 | 35s | Emergency Warning | 2 km | Second escalation, **user inside polygon** |
| 4 | 55s | Emergency Warning | — | Field update only, no level change — proves update ≠ escalation |

Step 4 is new and worth having: it demonstrates the diff engine distinguishes an update from an escalation, which is exactly the sort of correctness a judge cannot see otherwise.

## 14.4 Labelling and controls

Permanent, non-dismissible simulated-data banner. Presenter controls: play, pause, restart, seek to any step. Buttons get **accessible names** — they are labelled `1 2 3` today. Cold-start entry at `?demo=1` bypassing setup.

## 14.5 Demo mode must never be the only path that works

Anything visible only in demo is a liability under questioning. After §4.3, live mode shows real derived advice and real AI translation. The only genuinely simulated things become the fire itself and the escalation timing.

---

# 15. PRODUCTION AND DEPLOYMENT

## 15.1 Runtime

Vercel, Next.js App Router. `/api/warnings` and `/api/translate` on the **Node runtime**, not Edge — the in-memory cache and rate-limit counter need a warm instance, and Edge gives neither. Accept per-instance cache locality; at demo scale it is irrelevant.

## 15.2 Configuration

| Variable | Required | Absence |
|---|---|---|
| `ANTHROPIC_API_KEY` | No | Tiers 1+2 only. Nothing breaks |

No other configuration. No database, no accounts, no external services.

## 15.3 Add

- `vercel.json` for security headers: CSP with no external origins, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`
- GitHub Actions: `tsc --noEmit`, `vitest run`, `next build`, contrast gate — on every push to `branch/safesignal-proz`
- Cache-version bump wired to the build so the SW never pins a stale shell
- `/api/health` verified before the demo

## 15.4 Demo-day runbook

Rehearse on a cold device in aeroplane mode. Confirm `?demo=1` from a QR code. Verify voices exist for the demo language on the actual demo device. Have the deployed URL, a local `npm run dev`, and a recorded video as three independent fallbacks.

---

# 16. REAL VERSUS SIMULATED

The question a judge will ask, answered before they ask it.

## 16.1 Real — no simulation anywhere

| Capability | Evidence |
|---|---|
| NSW RFS feed ingestion | Live public feed, verified 2026-08-30 |
| Parsing, validation, normalisation | 150 tests; Sydney DST handling |
| Geospatial matching | Haversine + ray casting, real coordinates |
| Advice derivation | Mechanical, from real fields, traceable |
| Phrase-pack rendering, 4 languages | Human-written, in repo, offline |
| Text-to-speech | Browser `speechSynthesis`, real voices |
| Assistance numbers | **Real Australian services** — 000, TIS 131 450, Service NSW 13 77 88, RFS 1800 679 737, NRS 133 677 |
| Call script, checklist, share | Real generation from real profile |
| Offline / service worker | Genuine |
| Privacy | Structural — no endpoint accepts profile data |
| AI translation | Real Claude call when a key is present |

## 16.2 Simulated — and labelled on screen

| Thing | Why acceptable |
|---|---|
| The demo fire and its escalation | No Emergency Warning was active on 2026-08-30. Permanent banner; runs through the real pipeline |
| Demo timing (15s/20s) | Compression for a demo. Real fires escalate over hours |
| Pre-generated demo audio | Fallback only, for a device lacking a voice |

## 16.3 Must never be simulated

Alert levels. Official wording. Phone numbers. Feed data in live mode. Anything presented as official.

## 16.4 The honest sentence for the pitch

> "Everything you see is running against the real NSW RFS feed. The fire in this demo is simulated, because there is no Emergency Warning active in NSW today — and that is exactly why the demo is labelled on every screen. The pipeline, the matching, the translation and the help layer are all real."

---

# 17. BUILD ORDER

Sequenced so the product is demonstrable at every checkpoint.

| # | Work | Sections | Why here |
|---|---|---|---|
| 1 | Contrast fixes + `/api/translate` hardening + fetch timeouts | 7.3, 3.2 | Small, independent, removes the two defects and the one vulnerability |
| 2 | `rawDescription`, full `fields`, provenance type | 2.1–2.2 | Foundation everything else reads |
| 3 | Advice derivation + validation stage | 4.2–4.3 | Makes the AI layer live. Highest single value |
| 4 | Presentation boundary + invariant test | 0.2, 13.1 | The architectural centrepiece. Do before UI work |
| 5 | `WarningStore` diff engine + lifecycle events | 6 | Unblocks announcements and escalation |
| 6 | `LiveRegion` + `AnnouncerProvider` + speech queue | 6.2, 9.2 | Accessibility gap, cheap once 5 exists |
| 7 | `AlertSurface` + escalation transition + reduced-motion path | 6.3 | The WOW. Needs 4 and 5 |
| 8 | Warning card split, freshness grading, loading states | 1.3, 12.1 | Design and UX marks |
| 9 | Dark mode, text-size and language toggles, skip link | 7.2, 7.4 | Breadth of accessibility |
| 10 | Demo polygons + step 4, accessible control names | 14.2–14.4 | Makes the demo exercise the real path |
| 11 | Component tests, contrast gate, CI | 13.2, 15.3 | Protects 1–10 |
| 12 | Security headers, health route, runbook | 15.3–15.4 | Demo-day insurance |

**Checkpoints:** after 3 the AI is genuinely live; after 7 the demo has its moment; after 10 the demo is honest end to end.

---

# 18. OPEN QUESTIONS

1. **Judging total is 70, not 100.** `UNKNOWN — VERIFY` whether a fifth category exists
2. Do Emergency Warning incidents get distinct RFS URLs? Unverifiable on 2026-08-30
3. Have the four phrase packs been checked against official multilingual emergency material?
4. Time available before submission — determines where to cut §17
5. Should live mode surface `not-applicable` incidents behind a toggle, or stay hidden? Currently hidden, which is correct by default
