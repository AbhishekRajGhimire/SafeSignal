import { describe, it, expect, vi, afterEach } from 'vitest'
import { buildShareMessage, shareSituation } from './share'
import { DEFAULT_PROFILE, type UserProfile } from '@/lib/domain/profile'
import type { RelevantWarning } from '@/lib/domain/match'

const profile = (overrides: Partial<UserProfile> = {}): UserProfile => ({
  ...DEFAULT_PROFILE,
  location: { lat: -33.7128, lon: 150.3119, label: 'Katoomba' },
  ...overrides,
})

const relevant: RelevantWarning = {
  warning: {
    id: 'demo',
    level: 'emergency-warning',
    title: 'GREEN GULLY TRAIL, KATOOMBA',
    location: 'Green Gully Trail, Katoomba',
    council: 'Blue Mountains',
    status: 'Out of control',
    type: 'Bush Fire',
    sizeHa: 840,
    agency: 'Rural Fire Service',
    updatedAt: null,
    publishedAt: null,
    point: { lat: -33.69, lon: 150.31 },
    polygons: [],
    officialUrl: 'https://example.invalid',
    rawAdvice: null,
  },
  distanceKm: 2.1,
  inside: false,
  band: 'very-close',
}

afterEach(() => vi.unstubAllGlobals())

describe('buildShareMessage', () => {
  it('states the alert level, the place, and the distance', () => {
    const message = buildShareMessage(profile(), relevant)
    expect(message).toContain('Emergency Warning')
    expect(message).toContain('Katoomba')
    expect(message).toContain('2.1 km')
  })

  it('states the needs that make evacuation harder', () => {
    const message = buildShareMessage(
      profile({ mobility: 'wheelchair', transport: 'no-transport' }),
      relevant,
    )
    expect(message).toContain('wheelchair')
    expect(message).toContain('no transport')
  })

  it('omits need lines when there are none', () => {
    const message = buildShareMessage(profile({ mobility: 'none', transport: 'own-car' }), relevant)
    expect(message).not.toContain('wheelchair')
    expect(message).not.toContain('no transport')
  })

  it('still produces a usable message with no warning', () => {
    const message = buildShareMessage(profile(), null)
    expect(message).toContain('Katoomba')
    expect(message.length).toBeGreaterThan(20)
  })

  it('names SafeSignal as the sender so the recipient knows the source', () => {
    expect(buildShareMessage(profile(), relevant)).toContain('SafeSignal')
  })
})

describe('shareSituation', () => {
  it('uses the Web Share API when available', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { share })
    await expect(shareSituation('hello')).resolves.toBe('shared')
    expect(share).toHaveBeenCalledWith({ text: 'hello' })
  })

  it('falls back to the clipboard when sharing is unavailable', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    await expect(shareSituation('hello')).resolves.toBe('copied')
    expect(writeText).toHaveBeenCalledWith('hello')
  })

  it('reports unsupported rather than throwing when neither exists', async () => {
    vi.stubGlobal('navigator', {})
    await expect(shareSituation('hello')).resolves.toBe('unsupported')
  })

  it('reports unsupported when the user cancels the share sheet', async () => {
    vi.stubGlobal('navigator', { share: vi.fn().mockRejectedValue(new Error('AbortError')) })
    await expect(shareSituation('hello')).resolves.toBe('unsupported')
  })
})
