# SafeSignal

**Official NSW bushfire warnings, made understandable.**

Live: https://safe-signal-tau.vercel.app
Demo: https://safe-signal-tau.vercel.app/?demo=1
Source: https://github.com/AbhishekRajGhimire/SafeSignal

## The problem

Australia's emergency warning systems already reach people.
They do not guarantee that everyone who receives a warning can understand it or act on it.

An older Mandarin-speaking wheelchair user with no car receives a bushfire warning.
They cannot read the English confidently.
"Watch and Act" means nothing to them.
And they do not know who to call to get help leaving.

The gap is not delivery.
The gap is comprehension, and knowing the next action.

## What SafeSignal does

It takes the public NSW RFS warning feed and answers three questions in the reader's own language: what is happening, whether it affects them, and what to do next.

**SafeSignal does not create emergency advice.**
The official warning stays the source of truth.
The exact official English wording is shown on every warning, and anything SafeSignal wrote itself is labelled as SafeSignal's words.
This constraint is enforced in code, not just intended: `lib/domain/safety.test.ts` fails the build if the app ever authors advice text, claims someone is safe, or gains a routing dependency.

### The core idea

The official label and its meaning are different things:

| Official label | What it actually means |
|---|---|
| Watch and Act | A fire is close. Get ready to leave now. |
| Emergency Warning | You are in danger now. |

"Watch and Act" is meaningless to someone who has not absorbed Australian emergency conventions.
SafeSignal shows both, always.

### Features

- **Six languages**: English, Mandarin, Hindi, Vietnamese, Arabic, Nepali, including right-to-left layout
- **Location matching** by point-in-polygon against the warning's own geometry, falling back to distance
- **Speech** in the reader's language, with the app saying so plainly when a device has no voice rather than showing a dead button
- **Text scaling** that grows the whole type ramp and every tap target together
- **A help layer** that reorders itself by who you are: a Mandarin speaker sees the free interpreter line first, a wheelchair user with no transport sees evacuation assistance first
- **An English call script** with the reader's own language beside it, so they know what they are saying to the operator
- **Offline support** via service worker, because mobile networks congest during fires
- **Demo mode** with six rehearsable scenarios

## Running it

```bash
npm install
npm run dev
```

Then open http://localhost:3000/?demo=1

That URL works on a cold device with no setup and no location permission.

```bash
npm test
```

## Configuration

`ANTHROPIC_API_KEY` is optional.
Without it the app renders entirely from its own translated phrase packs and shows official advice in English.
Nothing breaks.
With it, free-text emergency advice is additionally translated and simplified, shown above the official English and labelled as SafeSignal's explanation.

## Design decisions worth knowing

**Place names stay in English.** A translated street name cannot be matched to a road sign, read to a Triple Zero operator, or searched on a map. The label beside it is translated instead, so the reader knows what the English text is.

**No user data leaves the device.** Location, mobility, transport and language live in `localStorage`. The warnings API takes no parameters, so there is nothing to send.

**The app never says you are safe.** It reports what the warning says and how fresh the data is. Only the RFS can tell someone they are out of danger.

**Freshness is never optional.** Every screen states how current its data is, because silent staleness is more dangerous than a visible error.

**It never shows a blank screen.** Feed unreachable, feed malformed, no API key, geolocation denied, no voice available, offline: each degrades to something still useful.

## Known limitations

Stated plainly rather than discovered by a judge.

**The AI translation layer does not fire on live warnings.** The RFS feed carries no free-text advice: its `description` is entirely structured key/value pairs, in both the JSON and XML forms, and the per-incident API is authenticated. The phrase packs cover 100% of live feed content deterministically; the AI layer covers free-text advice when a feed provides it, which is what demo mode shows.

**Translations are not native-speaker verified.** The plain-language wordings were written for this project and reviewed for meaning, not certified.

**Speech depends on the device.** A phone with no voice installed for the selected language will stay silent. The app says so rather than failing quietly.

**NSW bushfires only.** No flood, storm, or other hazard type, and no other state.

## Testing

530 tests across 34 files.

Coverage is aimed at what fails silently rather than at a percentage: feed parsing including the day-first date trap and Sydney timezone handling, relevance and point-in-polygon matching, phrase pack completeness across all six languages, translation safety verification, and the standing safety rules enforced against the source itself.

## Stack

Next.js 15, React 19, TypeScript, plain CSS with custom properties, Vitest.
No UI framework, no state library, no database, no mapping dependency.
Deployed on Vercel.

## Documentation

- Design spec: `docs/superpowers/specs/2026-08-29-safesignal-design.md`
- Implementation plan: `docs/superpowers/plans/2026-08-29-safesignal.md`
- References and attribution: `submission/references.md`
