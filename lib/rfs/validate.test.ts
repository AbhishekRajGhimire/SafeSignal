import { describe, it, expect } from 'vitest'
import { validateFeed, describeRejection, type FeedRejection } from './validate'

describe('validateFeed', () => {
  it('accepts a well formed FeatureCollection', () => {
    const result = validateFeed({ type: 'FeatureCollection', features: [{}, {}] })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.features).toHaveLength(2)
  })

  it('accepts an empty feed, which means no current incidents', () => {
    const result = validateFeed({ type: 'FeatureCollection', features: [] })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.features).toEqual([])
  })

  it('accepts a collection with no type, rather than refusing usable data', () => {
    expect(validateFeed({ features: [] }).ok).toBe(true)
  })

  it.each([
    [null, 'not-an-object'],
    [undefined, 'not-an-object'],
    ['a string', 'not-an-object'],
    [42, 'not-an-object'],
    [[], 'not-an-object'],
    [{ type: 'Feature', features: [] }, 'wrong-collection-type'],
    [{ type: 'FeatureCollection' }, 'features-missing'],
    [{ type: 'FeatureCollection', features: 'nope' }, 'features-not-an-array'],
    [{ type: 'FeatureCollection', features: {} }, 'features-not-an-array'],
  ])('rejects %j as %s', (input, reason) => {
    const result = validateFeed(input)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe(reason)
  })

  it('never confuses an empty feed with a malformed one', () => {
    const empty = validateFeed({ type: 'FeatureCollection', features: [] })
    const broken = validateFeed('<html>error page</html>')
    expect(empty.ok).toBe(true)
    expect(broken.ok).toBe(false)
  })

  it('describes every rejection reason', () => {
    const reasons: FeedRejection[] = [
      'not-an-object',
      'wrong-collection-type',
      'features-missing',
      'features-not-an-array',
    ]
    for (const reason of reasons) {
      expect(describeRejection(reason).length).toBeGreaterThan(10)
    }
  })
})
