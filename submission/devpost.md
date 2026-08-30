# DEVPOST SUBMISSION

Copy-paste ready.
Everything here is checked against the code, not written from memory.
Anything you still have to decide is marked **[DECIDE]**.

---

## Project name

SafeSignal

## Elevator pitch

*(Devpost caps this at ~200 characters.)*

Official NSW bushfire warnings, made understandable. Plain language, six languages, read aloud, plus a ranked list of who to call. SafeSignal never changes what the RFS said.

---

## About the project

### Inspiration

Australia's emergency warning systems already reach people.
They do not guarantee that everyone who receives a warning can understand it or act on it.

Picture an older Mandarin-speaking wheelchair user with no car.
A bushfire warning arrives on her phone.
She cannot read the English confidently.
"Watch and Act" means nothing to her.
And she does not know who to call to get help leaving.

The gap is not delivery.
The gap is comprehension, and knowing the next action.

That gap is widest for exactly the people least able to absorb it: older people, people with limited English, people with disabilities, and people with low digital literacy.

### What it does

SafeSignal takes the public NSW Rural Fire Service warning feed and answers three questions in the reader's own language: what is happening, whether it affects them, and what to do next.

**The core idea is that the official label and its meaning are different things.**

| Official label | What it actually means |
|---|---|
| Advice | A fire is burning nearby. There is no immediate danger. |
| Watch and Act | A fire is close. Get ready to leave now. |
| Emergency Warning | You are in danger now. |

"Watch and Act" is meaningless to anyone who has not absorbed Australian emergency conventions.
SafeSignal shows both, always, with the exact official English wording underneath.

Features:

- **Six languages**: English, Mandarin, Nepali, Hindi, Arabic and Vietnamese, including full right-to-left layout for Arabic
- **Location matching** by point-in-polygon against the warning's own geometry, falling back to distance when a warning carries no map area
- **Speech** in the reader's language, and the app says so plainly when a device has no voice rather than showing a dead button
- **Text scaling** that grows the whole type ramp and every tap target together, not just the font size
- **A help layer that reorders itself by who you are**: a Mandarin speaker sees the free interpreter line first, a wheelchair user with no transport sees evacuation assistance first
- **An English call script** with the reader's own language beside it, so they know what they are saying to the Triple Zero operator
- **Offline support** via service worker, because mobile networks congest during fires
- **Demo mode** with six rehearsable scenarios, so the escalation path can be shown without waiting for a real fire

**SafeSignal never creates emergency advice.**
The official warning stays the source of truth.
This is enforced in code, not just intended: `lib/domain/safety.test.ts` fails the build if the app ever authors advice text, claims someone is safe, or takes on a routing dependency.

### How we built it

Next.js 15, React 19, TypeScript, plain CSS with custom properties, and Vitest.
No UI framework, no state library, no database, and no mapping dependency.
Deployed on Vercel.

Two design decisions shaped everything else.

**One interface, two sources.** A `WarningSource` seam has a `LiveSource` that polls the real RFS feed and a `DemoSource` that plays scripted scenarios. Demo mode therefore exercises the real application rather than a mock of it, which is why the demo is trustworthy evidence that the live path works.

**Nothing about the user leaves the device.** Location, mobility, transport and language live in `localStorage`. The warnings API takes no parameters at all, so there is nothing to send. Optional AI translation sends only the warning text, never anything about the reader.

The optional AI layer uses the Anthropic Messages API to translate and simplify free-text emergency advice. Its output is verified before display: a translation that introduces a number the source never contained is rejected outright, because that is what a changed distance, a changed address or an invented phone number looks like. When a translation is rejected, the official English is shown alone.

### Challenges we ran into

**A date format that fails silently.** The RFS feed publishes `29/08/2026 4:12:00 AM`, which is 29 August. JavaScript's `new Date()` reads it as 8 September. A warning would have been shown with a timestamp ten days wrong, and nothing would have thrown.

**Timestamps with no timezone.** The feed's times are Sydney local, but carry no offset, so a naive parse is wrong by ten or eleven hours depending on daylight saving. We resolve the offset with `Intl.DateTimeFormat` and settle it twice so the DST boundary itself is handled.

**A truncation bug that passed our own safety check.** Our token limit was cutting long Hindi translations off mid-word. Our length guard did not catch it, because Hindi expands relative to English, so a truncated translation still scored inside the accepted length ratio. We found it by measuring real responses in production, and fixed it by checking the API's own `stop_reason` rather than inferring from length.

**An open proxy we shipped ourselves.** An early AI endpoint accepted text from anyone with no rate limit, origin check or length cap. We caught it, removed it, and the surviving route is same-origin only, rate limited per IP, length capped, and times out.

**No emergencies to test against.** We built this in late winter. The live feed had zero Emergency Warnings, and 50 of 63 entries were historical records rather than warnings at all. Demo mode exists because the real feed cannot demonstrate the thing that matters most.

**The AI layer does not fire on live warnings**, and we chose to document that rather than hide it. The RFS feed carries no free-text advice: its description is entirely structured key/value pairs, and the per-incident API returns 401 to unauthenticated callers. The hand-written phrase packs cover 100% of live feed content deterministically.

### Accomplishments that we're proud of

**We separated the label from the meaning.** Every emergency app shows "Watch and Act". Showing what it actually means, in the reader's language, beside the official wording, is the whole product in one idea.

**We made a safety constraint executable.** "SafeSignal never authors emergency advice" is not a promise in a README. It is a test that reads our own source and fails the build if we break it.

**It never shows a blank screen.** Feed unreachable, feed malformed, no API key, geolocation denied, no voice available, offline: each one degrades to something still useful, and every screen states how current its data is. Silent staleness is more dangerous than a visible error.

**534 tests across 34 files**, aimed at what fails silently rather than at a coverage percentage.

### What we learned

**Reading the code is not verifying it.** Several real defects survived careful review and were caught in the first ten seconds of actually rendering the app: a duplicated heading, a hardcoded date locale, demo settings writing themselves permanently to the device.

**Accessibility is architecture, not styling.** Text scaling that grows tap targets with the type ramp, colour that is never the only signal, and a language choice that reaches the speech engine are all structural decisions. None of them can be added at the end.

**Say the limitation before someone finds it.** Our AI layer does not fire on live data. Our translations are not native-speaker verified. Writing those down made the project more credible, not less.

### What's next for SafeSignal

**Pre-rendered speech.** Audio currently depends on the reader's phone having a voice installed for their language, and a budget Android often does not. Our phrase packs are fixed at build time, so the fix is to generate neural audio for them ahead of time and ship it in the offline cache: better voices, guaranteed on any device, and still working with no network.

**A second hazard.** The warning levels SafeSignal translates are the Australian Warning System, shared by flood, storm and extreme heat, not fire alone. Because of the `WarningSource` seam, a second hazard is a source adapter rather than a rewrite.

**Native-speaker verification** of the plain-language wordings, which is the one thing we could not do ourselves.

---

## Built With

```
next.js  react  typescript  vitest  css  anthropic-claude  vercel
web-speech-api  service-workers  geojson  nsw-rfs  pwa
```

## Try it out

- Live: https://safe-signal-tau.vercel.app
- Demo: https://safe-signal-tau.vercel.app/?demo=1
- Source: https://github.com/AbhishekRajGhimire/SafeSignal

**Demo tip for judges:** open the live link first, tap a language button on the front screen and watch the whole page change, then tap Demo mode.

---

## Still to fill in

- **[DECIDE]** Team members and roles. See `submission/contributions.md`.
- **[DECIDE]** Which challenge blocks you are entering. The build targets Block 4 (accessibility to essential resources) and Block 5 (accessible information and digital services).
- **[DECIDE]** Video link.
- **[DECIDE]** Screenshots. Strongest three: the front screen with the language buttons, an Emergency Warning in Mandarin beside the official English, and the call script with both languages side by side.
