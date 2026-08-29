# REFERENCES

Everything external that SafeSignal depends on, calls, or presents to a user.

Every item below was verified against the running code on 2026-08-30.
Nothing is listed from memory.

## Data source

**NSW Rural Fire Service major incidents feed**
`https://www.rfs.nsw.gov.au/feeds/majorIncidents.json`

Public, unauthenticated GeoJSON.
This is SafeSignal's only source of warning data.
An XML/RSS form of the same feed exists at `majorIncidents.xml` and carries the same fields; we use the JSON.

Feed characteristics we depend on, established by inspecting live responses:

- `properties.category` carries the alert level
- `properties.description` is a set of `KEY: value` pairs separated by `<br />`, not prose
- `properties.pubDate` is day-first (`29/08/2026 4:12:00 AM`) and in Sydney local time
- The `UPDATED` field inside `description` uses a different format again (`29 Aug 2026 14:12`), also Sydney local time
- Geometry is either a `Point` or a `GeometryCollection` mixing a point with polygons
- The feed sends `Access-Control-Allow-Origin: *`, but only when a request carries an `Origin` header

The per-incident endpoint referenced by each item's `guid`
(`https://incidents.rfs.nsw.gov.au/api/v1/incidents/<id>`) returns **401 Unauthorized** to unauthenticated callers.
SafeSignal does not use it.
This is why the feed carries no free-text advice for us to translate outside demo mode.

## Services called at runtime

**Anthropic Messages API**
`https://api.anthropic.com/v1/messages`

Used by `app/api/translate/route.ts` to translate and simplify free-text emergency advice into the reader's language.
Optional: without `ANTHROPIC_API_KEY` the application runs fully on its own translated phrase packs.

## Official services presented to users

SafeSignal displays these numbers and directs users to them.
It does not operate, partner with, or represent any of them.

| Service | Number |
|---|---|
| Triple Zero (Police, Fire, Ambulance) | 000 |
| TIS National (free interpreting service) | 131 450 |
| Service NSW | 13 77 88 |
| NSW RFS Bush Fire Information Line | 1800 679 737 |
| National Relay Service | 133 677 |
| NSW SES | 132 500 |

Users are also linked to the official RFS warning page at
`https://www.rfs.nsw.gov.au/fire-information/fires-near-me`.

## Libraries

Runtime:

- `next` ^15.1.0
- `react` ^19.0.0
- `react-dom` ^19.0.0
- `@anthropic-ai/sdk` ^0.122.0 (present in `package.json`; the translate route currently calls the API over `fetch` and does not import it)

Development:

- `typescript` ^5.7.0
- `vitest` ^2.1.8
- `@types/node`, `@types/react`, `@types/react-dom`

No mapping, routing, geocoding, UI component, or CSS framework is used.
`lib/domain/safety.test.ts` asserts that no routing or mapping dependency is ever added, because generating an evacuation route is outside what this application is allowed to do.

## Data authored by us

- **NSW place centroids** (`lib/locations/nsw.ts`): a hand-entered list of NSW towns and suburbs with coordinates and postcodes, used for manual location entry so the app needs no geocoding service and works offline.
- **Phrase packs** (`lib/i18n/phrases/`): plain-language wordings in English, Mandarin, Hindi, Vietnamese, Arabic and Nepali, written for this project.
- **Demo scenarios** (`lib/sources/scenario.ts`): simulated warnings written for demonstration. They carry provenance reading `SIMULATED — not issued by the NSW Rural Fire Service`, and demo mode always displays a simulated-data banner.

## Attribution and standing

SafeSignal is not affiliated with, endorsed by, or operated by the NSW Rural Fire Service or any government agency.
It presents official warnings and links back to the official source.
The official English wording is shown verbatim on every warning.
