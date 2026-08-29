/**
 * Schema validation, kept separate from normalization.
 *
 * The distinction that matters operationally: an empty feed means "no current
 * incidents", while a malformed feed means "we cannot trust anything we just
 * received". Collapsing those two into an empty array, as an unvalidated
 * parse does, would show a user "no warnings near you" during an outage.
 */

export type FeedRejection =
  | 'not-an-object'
  | 'wrong-collection-type'
  | 'features-missing'
  | 'features-not-an-array'

export type FeedValidation =
  | { ok: true; features: unknown[] }
  | { ok: false; reason: FeedRejection }

/** GeoJSON says FeatureCollection. The RFS feed has always sent it. */
const EXPECTED_TYPE = 'FeatureCollection'

export function validateFeed(raw: unknown): FeedValidation {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, reason: 'not-an-object' }
  }

  const doc = raw as Record<string, unknown>

  // A wrong `type` is tolerated only when it is absent: the RFS has changed
  // incidental fields before without warning, and refusing a feed that is
  // otherwise well formed would be a worse failure than accepting it.
  if (typeof doc.type === 'string' && doc.type !== EXPECTED_TYPE) {
    return { ok: false, reason: 'wrong-collection-type' }
  }

  if (!('features' in doc)) return { ok: false, reason: 'features-missing' }
  if (!Array.isArray(doc.features)) return { ok: false, reason: 'features-not-an-array' }

  return { ok: true, features: doc.features }
}

export function describeRejection(reason: FeedRejection): string {
  switch (reason) {
    case 'not-an-object':
      return 'The feed did not contain a JSON object.'
    case 'wrong-collection-type':
      return 'The feed was not a GeoJSON FeatureCollection.'
    case 'features-missing':
      return 'The feed contained no features property.'
    case 'features-not-an-array':
      return 'The feed features property was not a list.'
  }
}
