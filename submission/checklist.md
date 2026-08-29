# FINAL CHECKLIST

Ticked only where verified, with the evidence.
Everything unticked is genuinely outstanding.
Last verified 2026-08-30 against the deployed build.

## Verified

- [x] **Core functionality** — 530 tests across 34 files, typecheck and production build clean. Live and demo modes both exercised end to end in a browser against the deployed URL.
- [x] **Responsive** — checked at 375px with text scaling at 1.35: no horizontal overflow, minimum tap target 59px.
- [x] **Security** — the translate route is same-origin only, rate limited to 20 requests per 5 minutes per IP, caps source length, and times out. Verified on production: a request from a foreign origin is rejected. No secrets are committed; the only env file in git is `.env.example` with an empty value.
- [x] **Performance** — first load 137 kB on the warning screen. No mapping, UI or state library. Warning feed cached 30s server-side.
- [x] **Demo** — `?demo=1` works on a cold device with no setup and no location permission. Six scenarios with a reset control.
- [x] **README** — `submission/README.md`, including a stated limitations section.
- [x] **References** — `submission/references.md`, verified against running code rather than memory.
- [x] **No secrets** — scanned before the repository was made public.

## Partially verified — needs a decision or a pass

- [ ] **Accessibility** — the foundations are in and tested: colour is never the only signal (colour plus shape plus word), text scaling grows the type ramp and tap targets together, focus rings are visible, contrast tokens are documented against WCAG 1.4.11, RTL is supported for Arabic, and the app states plainly when speech is unavailable. **Not done:** a screen reader pass, and a contrast audit of the merged design system.
- [ ] **Challenge requirements** — the project targets Block 4 (accessibility to essential resources) and Block 5 (accessible information and digital services). Worth one read of `docs/01-CHALLENGE.md` against the finished build to confirm nothing stated is unmet.

## Outstanding

- [ ] **Backup demo** — nothing exists. If the venue wifi fails or the deployed site is unreachable, there is currently no fallback. A screen recording of the demo path is the cheapest insurance and should be made before anything else on this list.
- [ ] **Screenshots**
- [ ] **Video**
- [ ] **Contributions** — `submission/contributions.md`. Must be written by the team; see the note in that file.
- [ ] **Submission rules verified** — confirm format, deadline and platform against the official brief.

## Known issues to decide on before demoing

- **The default demo landing screen shows "This information may be out of date."** `lib/domain/screenState.ts` maps an `undetermined` relevance verdict onto `stale-data`. The data is fresh; the app simply cannot tell whether an 8km Advice affects the user. This is the first screen a judge sees and it currently states the wrong reason.
- **The AI translation layer does not fire on live warnings**, because the RFS feed carries no free-text advice. Documented under limitations in the README. Have the honest framing ready rather than being asked.
- **Translations are not native-speaker verified.** The eight `levelMeaning` and `levelAction` sentences carry the product's central claim and are the strings a judge who speaks one of those languages will check first.
- **Speech is device-dependent.** Test on the actual presentation phone; a device with no voice for the selected language will stay silent and say so.

## Demo note

`docs/02-JUDGING.md` weights Implementation at 30 of 70 stated points, and warns that stopping the demo at comprehension answers the use case only halfway.
The demo should run through to action: the ranked services, and the English call script with the reader's own language beside it.
