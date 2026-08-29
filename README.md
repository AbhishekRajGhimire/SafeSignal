# SafeSignal

Official NSW bushfire warnings, made understandable.

SafeSignal takes the public NSW RFS warning feed and presents it in plain language, in English, Mandarin, Hindi, and Vietnamese, with speech, large text, and a profile-aware help layer.

SafeSignal does not create emergency advice.
The official warning stays the source of truth, and the exact official English wording is shown on every warning alongside the plain-language version.

## The idea

Australia's warning systems already reach people.
They do not guarantee that everyone who receives a warning can understand it or act on it.

An older Mandarin-speaking wheelchair user with no car may get a bushfire warning, be unable to read the English text confidently, and not know who to call for help evacuating.
SafeSignal closes that gap: it explains what "Watch and Act" actually means, reads it aloud in their language, and hands them the right phone number with an English script to read to the operator.

## Running it

```bash
npm install
npm run dev
```

Demo mode, which does not need any live warnings to exist:

```
http://localhost:3000/?demo=1
```

That URL works on a cold device with no setup and no location permission.
It anchors a scripted escalation (Advice, then Watch and Act, then Emergency Warning) to the Blue Mountains, and carries a permanent banner stating the data is simulated.

Tests:

```bash
npm test
```

## Configuration

`ANTHROPIC_API_KEY` is optional.
Without it, SafeSignal renders from its own translated phrase packs and shows official advice in English.
Nothing breaks.
With it, free-text RFS advice is additionally translated and simplified into the user's language.

## How it is built

The server owns exactly two things: the CORS-blocked feed fetch, and custody of the API key.
`/api/warnings` takes no parameters and returns every current NSW warning.

Everything else runs in the browser: matching warnings against the user's location, language rendering, speech, and the help layer.

The whole app consumes one interface, `WarningSource`, with two implementations.
`LiveSource` polls the warnings route; `DemoSource` runs the scripted escalation.
Nothing downstream knows which one it is talking to, so demo mode exercises the real application rather than a parallel fake.

## Privacy

Location, mobility, transport, and language preferences are stored in the browser and are never sent anywhere.
The warnings API takes no parameters, so there is nothing to send.

## Accessibility

Four languages, all left-to-right, with an explicit Devanagari font fallback so Hindi does not render as boxes.

Large text scales the whole type ramp and every tap target together, from 44px to 59px.

Alert levels carry a colour, a distinct shape, and a word, so none of colour blindness, a bright outdoor screen, or a screen reader loses the signal.

Speech uses the browser's own synthesiser.
When a device has no voice for the selected language, the app says so plainly rather than presenting a button that does nothing.

## Failure behaviour

SafeSignal never shows a blank screen or an error page, and every screen states how fresh its data is.

| Failure | Behaviour |
|---|---|
| Feed unreachable | Last good payload, behind an "as at HH:MM" label |
| Feed malformed | Drop unparseable features, count them, render the rest |
| Claude unavailable or no key | Phrase-pack rendering, no visible break |
| Geolocation denied | Manual town search, already on screen |
| No voice for language | Stated plainly |
| Offline | Service worker serves the shell and the last warnings |

## Design and plan

- `docs/superpowers/specs/2026-08-29-safesignal-design.md`
- `docs/superpowers/plans/2026-08-29-safesignal.md`
