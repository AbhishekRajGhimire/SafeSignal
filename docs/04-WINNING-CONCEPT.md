# WINNING CONCEPT

**Selected. Built. In improvement phase.**

## Name

**SafeSignal**

## One sentence

Official NSW bushfire warnings, made understandable — in plain language, in your language, read aloud, with the right phone number and a script to read to the operator.

## Problem

Emergency warnings in Australia are not equally accessible to everyone.

NSW already runs capable systems: RFS warnings, Hazards Near Me, AusAlert. They reach people. They do not guarantee that everyone who receives a warning can understand it or act on it.

**The gap is not delivery. The gap is comprehension and next action.**

## Target user

An older Mandarin-speaking wheelchair user with no car.

She receives a bushfire warning, cannot read the English text confidently, and does not know who to call to get help evacuating.

Not "people with accessibility needs." That person.

## Solution

A mobile-first PWA that:

1. Reads the real public NSW RFS warning feed
2. Matches warnings against her stated or detected location
3. Renders the warning in plain language in English, Mandarin, Hindi or Vietnamese
4. Shows the **exact official English wording** underneath, labelled and linked
5. Reads it aloud in her language
6. Scales the entire type ramp and every tap target together in large-text mode
7. Hands her a help layer: services filtered by her actual situation, an English call script, an action checklist, and share-my-situation

## Why it matters

She acts. Without asking anyone for help, and without a family member translating for her.

## Differentiation

**SafeSignal does not create emergency advice.** The official warning stays the source of truth, shown verbatim on every screen.

That constraint is what separates this from an app that invents emergency guidance, and it is load-bearing — it survives every implementation decision.

The second differentiator is that **translation is only half the product.** Understanding a warning does not tell you who to call. The help layer — the right number, an English script, a checklist filtered by whether you have a car — is the part that turns comprehension into action.

## Technical WOW

**The `WarningSource` seam.** One interface, two implementations. `LiveSource` polls the real feed; `DemoSource` runs a scripted escalation. Nothing downstream knows which it is talking to, so **demo mode exercises the real application rather than a parallel fake.**

Supporting: the server owns exactly two responsibilities — the CORS-blocked fetch and custody of the API key. `/api/warnings` takes no parameters, so location, mobility and language have no endpoint to leak to. The privacy claim is structural, not policy.

No API key does not break the app; it falls back to translated phrase packs.

## Visual WOW

**The escalation.** Advice → Watch and Act → Emergency Warning.

`UNKNOWN — NOT YET BUILT.` Currently the card swaps silently. Making the whole screen respond to alert level is the highest-value remaining design work — it fixes hierarchy, branding and the memorable moment in one change.

## MVP

**Complete.** 150 tests across 19 files, clean production build, deployed to a real HTTPS URL, demo mode working with no network and no setup.

## Blocks addressed

- **Primary — Block 5:** Accessible information and digital services
- **Secondary — Block 4:** Accessibility to essential resources

## Remaining work

Priority order derived from the judging weighting, in `docs/02-JUDGING.md`.

1. Fix two verified accessibility defects (Watch and Act badge 3.84:1; form borders 1.39:1)
2. Make the whole screen respond to alert level — hierarchy, branding, WOW
3. Say the architecture out loud in the demo
4. Ensure the demo reaches the help layer
5. Real loading state; resolve the CTA/Emergency-Warning red collision
6. Verify existing multilingual support in Hazards Near Me before claiming the gap
