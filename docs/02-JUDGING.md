# JUDGING CRITERIA — SYNCS HACK 2026

**Source:** provided by the team, 2026-08-30.
**Project:** SafeSignal — official NSW bushfire warnings, made understandable.

---

## ⚠️ OPEN QUESTION — THE POINTS DO NOT SUM TO 100

| Criterion | Points |
|---|---:|
| Idea | 15 |
| Implementation | 30 |
| Design | 15 |
| Pitch | 10 |
| **Stated total** | **70** |

Either the competition is marked out of 70, or roughly 30 points sit in a category we have not been given.

**UNKNOWN — VERIFY with the organisers.** Do not assume. If a fifth category exists and it is worth 30 points, it is worth as much as Implementation and would change what we build.

All weighting below is calculated on the **stated 70**. Recalculate if this resolves.

---

## WEIGHTING — WHAT ACTUALLY MATTERS

| Criterion | Points | Share of stated total |
|---|---:|---:|
| **Implementation** | 30 | **43%** |
| Idea | 15 | 21% |
| Design | 15 | 21% |
| Pitch | 10 | 14% |

**The single most important consequence:** Implementation is worth more than Idea and Design combined. A beautiful, well-branded app that is thin underneath loses to a working one. Our engineering is currently our strongest asset — 150 passing tests, a real architectural seam, genuine failure handling — and the judging rewards exactly that.

**The second consequence:** the idea is now fixed. Those 15 points are already banked or already lost; no further ideation changes them. Effort should go to Implementation first, then Design and Pitch, which are equal at 15 and 10.

---

# 1. IDEA — 15 points

> *Is the problem or use case realistic? Is the solution unique or innovative?*

### Requirement
A real problem, and an approach that is not obvious.

### Strategy
Lead with the concrete person, never the category. The design spec already names her: **an older Mandarin-speaking wheelchair user with no car, who receives a bushfire warning, cannot read the English confidently, and does not know who to call to get help evacuating.**

The framing that earns the "unique" half of this criterion:

> **The gap is not delivery. NSW already has RFS, Hazards Near Me and AusAlert, and they reach people. The gap is comprehension and next action.**

That sentence is the whole differentiation. We are not building another warning app; we are building the layer between receiving a warning and being able to act on it.

### Proof
- We consume the **real** NSW RFS public feed, not invented data
- We do not author emergency advice — official wording is shown verbatim on every warning
- Four languages chosen for NSW demographics, not for demo convenience

### Demo moment
The opening line names the person, not the technology.

### Risk
**"Isn't this just Google Translate on a government page?"** — the strongest attack available to a judge, and it must be answered before it is asked. The answer is the help layer: translation alone does not give you the right phone number, an English script to read to the operator, or a checklist filtered by whether you have a car. Show that, do not claim it.

### Second risk
`UNKNOWN — VERIFY`: whether Hazards Near Me already ships multilingual support. If it does and we have not checked, a judge who knows the space will find it. **Check before the pitch.**

---

# 2. IMPLEMENTATION — 30 points

> *Is your solution functional? Does the solution display impressive technical skills? Does the solution address the use case?*

This is the largest block and it is three separate questions. Answer all three explicitly.

## 2a. Is it functional?

### Strategy
It must not break on stage. Everything else in this section is worthless if it does.

### Proof
- `npm test` — **150 tests, 19 files, all passing**
- `npm run build` — clean, 6 routes
- Deployed and reachable on a real HTTPS URL that a judge can open on their own phone
- Documented failure behaviour for every dependency: feed unreachable, feed malformed, no API key, geolocation denied, no voice for language, offline

### Demo moment
Hand a judge the URL and let them open it on their own device. Nothing else proves "functional" as fast.

### Risk
Venue wifi. **Demo mode must work with no network and no setup** — it already does, via `?demo=1`. Rehearse on a cold device in aeroplane mode.

## 2b. Does it display impressive technical skills?

### Strategy
Judges cannot see architecture. It must be **shown**, in about twenty seconds, or it scores nothing. The three things worth showing:

1. **The `WarningSource` seam.** One interface, two implementations — `LiveSource` polls the real feed, `DemoSource` runs the scripted escalation. Nothing downstream knows which. **Demo mode exercises the real application, not a parallel fake.** This is the most technically respectable decision in the codebase and it is invisible unless stated.
2. **Graceful degradation as a design property.** No Claude API key does not break the app — it falls back to translated phrase packs. Say this out loud.
3. **Client-side privacy.** `/api/warnings` takes no parameters. Location, mobility and language never leave the device — not as a policy, but because there is no endpoint to send them to.

### Proof
- 150 tests
- The seam is real and testable without a network
- Server owns exactly two things: the CORS-blocked fetch, and custody of the API key

### Demo moment
One sentence during the demo-mode toggle: *"This is the same code path as live — demo mode swaps the data source, not the app."*

### Risk
**Understating it.** The strongest engineering here is architectural and therefore invisible. If nobody says it, nobody scores it.

## 2c. Does it address the use case?

### Strategy
Trace one unbroken line from the person to the outcome, on screen: **warning arrives → she understands it in Mandarin → she hears it aloud → she gets the right phone number and an English script to read to the operator.**

### Proof
The help layer is the answer to this sub-criterion. Service directory filtered by her actual situation, English call script, checklist, share-my-situation.

### Risk
Stopping the demo at comprehension. **Translation is half the product.** If the demo ends at "now she can read it", we have answered 2c with 50%.

---

# 3. DESIGN — 15 points

> *Does the solution have a good user experience? Is the solution well-branded and cohesive? Is the UI readable and accessible?*

Three sub-questions again, and we are currently strong on one, weak on two.

## 3a. Good user experience

**Current state:** functional, plain. Mobile-first single column, sensible flow.

**Known gap:** the cold-load state is literally `<p>...</p>`. First thing a judge sees.

## 3b. Well-branded and cohesive

**Current state: this is our weakest criterion in the entire rubric.** SafeSignal has a correct design system and no identity. There is no logo, no wordmark, no distinctive visual signature. An Emergency Warning and an Advice notice look about 95% identical — both a white card on grey with a small coloured pill.

**Strategy:** make the whole screen respond to alert level. This fixes branding, hierarchy and the demo's WOW moment in one change.

**Known collision:** `.button--danger` on the Get Help CTA uses `#c8102e` — the exact same red as the Emergency Warning level. The call-to-action and the top alert level are the same colour. Fix.

## 3c. Readable and accessible

**Current state:** genuinely strong, and two verified defects.

Strengths — real, and worth saying in the pitch:
- Colour is never the only signal: every level carries a colour, a distinct shape, and a word
- Large text is a full type-ramp scale, not a font bump; tap targets grow with it
- `prefers-reduced-motion` respected
- Devanagari font fallback so Hindi does not render as boxes
- Voice absence stated plainly rather than a button that does nothing

Verified defects — measured, not guessed:

| Defect | Measured | Required | Where |
|---|---:|---:|---|
| "Watch and Act" badge, white on `#e35205` | **3.84:1** | 4.5:1 | Second-highest alert level |
| Form borders, `--line #d6dbe2` on white | **1.39:1** | 3:1 (WCAG 1.4.11) | Every control in the setup wizard |

`.muted` at 6.39:1 passes AA but misses the 7.4:1 body target in our own CLAUDE.md.

### Demo moment
Toggle large text live. The whole ramp and every tap target scale together. It takes three seconds and it proves accessibility is architectural rather than bolted on.

### Risk
Claiming accessibility while shipping a level badge that fails AA. **Fix both defects before the pitch** — a judge who checks will find them, and it undermines the entire positioning.

---

# 4. PITCH — 10 points

> *Is the pitch engaging, clearly addressing the theme and problem statement?*

### Requirement
Engaging, and explicitly tied to the theme and the problem.

### Strategy
Name the theme out loud. The challenge is **Blocks** — barriers. SafeSignal removes a specific barrier between an official warning and a person who cannot act on it. Do not leave the judge to infer the connection.

Structure, per the demo formula:

| Beat | Content |
|---|---|
| Problem | The person. Not the statistic |
| User | Her actual situation: Mandarin, wheelchair, no car |
| Action | The warning arrives |
| Technology | Plain language, her language, spoken aloud |
| Result | The phone number and the English script |
| WOW | The escalation — Advice → Watch and Act → Emergency Warning |
| Impact | She acted. Without asking anyone for help |

### Proof
Live URL on the judge's own phone.

### Risk
Running long and losing the help layer, which is the answer to a 30-point criterion. **Rehearse to time.** If something must be cut, cut architecture narration before cutting the help layer.

---

# PRIORITY ORDER

Derived from the weighting, not from preference.

| Priority | Work | Criterion | Points at stake |
|---|---|---|---:|
| 1 | Fix the two accessibility defects | 3c | Undermines Design **and** the Idea framing |
| 2 | Make the whole screen respond to alert level | 3b + WOW | 15 |
| 3 | Say the architecture out loud in the demo | 2b | Large share of 30 |
| 4 | Ensure the demo reaches the help layer | 2c | Large share of 30 |
| 5 | Real loading state, fix the red collision | 3a/3b | 15 |
| 6 | Verify Hazards Near Me multilingual support | 1 | 15 |
| 7 | Rehearse to time | 4 | 10 |

---

# OPEN ITEMS

- [ ] **Confirm whether the total is 70 or 100.** If a fifth category exists, this document is incomplete
- [ ] Confirm pitch length and format `UNKNOWN — VERIFY`
- [ ] Confirm whether judges see the code or only the demo `UNKNOWN — VERIFY`
- [ ] Verify Hazards Near Me / AusAlert existing multilingual support before claiming the gap
