# DEMO RUNBOOK

**Entry point:** `https://safe-signal-tau.vercel.app/?demo=1`

Works on a cold device with no setup, no location permission and no network
after first load. Lands on Scenario 3, the escalation.

Every screen in demo mode carries a permanent, non-dismissible banner
stating the data is simulated. Every simulated warning also carries
`SIMULATED — not issued by the NSW Rural Fire Service` in its provenance and
an id prefixed `safesignal-demo`, so nothing downstream can mistake it for
issued RFS content.

---

## The six scenarios

Selected from the presenter panel at the bottom of the screen.

| # | Scenario | Shows |
|---|---|---|
| 1 | No active warning | The clean negative state, and that it never says "safe" |
| 2 | Emergency at your location | The full emergency experience: level, meaning, action, official message, speech, help |
| 3 | Warning changes | The escalation, and "What changed?" |
| 4 | Warning elsewhere | A real Emergency Warning 25 km away that does **not** cover the user |
| 5 | Feed becomes unavailable | fresh → stale → unreachable, and how each is stated |
| 6 | Mandarin · large text · audio · mobility | Every accessibility feature at once |

**Scenario 3 has four steps.** Advice → Watch and Act → Emergency Warning →
*updated without escalating*. The fourth step exists to show that the diff
engine tells an update apart from an escalation.

**Scenario 6 borrows your profile and gives it back.** Selecting it stashes
your real settings and applies the preset. Choosing any other scenario,
pressing Reset, or leaving demo mode restores them. Nothing is written over.

---

## Reset

**Reset demo** returns everything to a known state in one tap: default
scenario, first step, paused, and your real profile restored.

---

## Demo-day checklist

- [ ] Open `?demo=1` on the actual demo device, cold, before the session
- [ ] Confirm a Mandarin voice exists on that device (Scenario 6, press Listen)
- [ ] Run once in aeroplane mode after first load, to prove the offline path
- [ ] Have three independent fallbacks: the deployed URL, a local `npm run dev`, and a recorded video

## What is real and what is simulated

Real: the RFS feed pipeline, parsing, validation, geospatial matching,
phrase-pack rendering in six languages, speech, the help layer and its
phone numbers, offline behaviour, and the privacy model.

Simulated: the fire itself and the timing of its escalation. Compressed to
seconds; a real fire escalates over hours.

The honest sentence for the pitch:

> Everything you see runs against the real NSW RFS pipeline. The fire is
> simulated, because there is no Emergency Warning active in New South Wales
> today, and that is why every screen is labelled.
