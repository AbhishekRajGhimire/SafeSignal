import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { POST } from './route'

const SOURCE = 'The fire is 2 km away. Call 000 if you are trapped.'

function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request('https://safesignal.test/api/translate', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

function anthropicReplies(text: string) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ content: [{ type: 'text', text }] }),
  })
}

beforeEach(() => {
  vi.stubEnv('ANTHROPIC_API_KEY', 'test-key')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

/** Each test uses a fresh IP so the in-memory rate limiter does not bleed. */
let n = 0
const freshIp = () => ({ 'x-forwarded-for': `10.0.0.${(n += 1)}` })

describe('successful translation', () => {
  it('returns the translated text', async () => {
    vi.stubGlobal('fetch', anthropicReplies('火距离 2 公里。如被困请拨打 000。'))
    const response = await POST(request({ text: SOURCE, language: 'zh' }, freshIp()))
    expect(await response.json()).toEqual({
      status: 'translated',
      text: '火距离 2 公里。如被困请拨打 000。',
    })
  })

  it('always answers 200, so a failure never triggers a retry storm', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }))
    const response = await POST(request({ text: SOURCE, language: 'zh' }, freshIp()))
    expect(response.status).toBe(200)
  })

  it('sends an abort signal so a hung model call cannot stall the route', async () => {
    const spy = anthropicReplies('ok 2 000')
    vi.stubGlobal('fetch', spy)
    await POST(request({ text: SOURCE, language: 'zh' }, freshIp()))
    expect(spy).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({ signal: expect.anything() }),
    )
  })
})

describe('translation failure', () => {
  it('rejects a translation that invents a phone number', async () => {
    vi.stubGlobal('fetch', anthropicReplies('火距离 2 公里。请拨打 112。'))
    const response = await POST(request({ text: SOURCE, language: 'zh' }, freshIp()))
    expect(await response.json()).toEqual({ status: 'unavailable', reason: 'rejected-unsafe' })
  })

  it('reports an upstream HTTP error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 529 }))
    const response = await POST(request({ text: SOURCE, language: 'zh' }, freshIp()))
    expect(await response.json()).toEqual({ status: 'unavailable', reason: 'http-error' })
  })

  it('reports a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    const response = await POST(request({ text: SOURCE, language: 'zh' }, freshIp()))
    expect(await response.json()).toEqual({ status: 'unavailable', reason: 'network' })
  })

  it('treats a missing API key as a supported configuration, not an error', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    const response = await POST(request({ text: SOURCE, language: 'zh' }, freshIp()))
    expect(await response.json()).toEqual({ status: 'unavailable', reason: 'no-key' })
  })
})

describe('API timeout', () => {
  it('reports a timeout distinctly from a generic network failure', async () => {
    const timeout = Object.assign(new Error('timed out'), { name: 'TimeoutError' })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(timeout))
    const response = await POST(request({ text: SOURCE, language: 'zh' }, freshIp()))
    expect(await response.json()).toEqual({ status: 'unavailable', reason: 'timeout' })
  })
})

describe('unsupported language', () => {
  it.each(['en', 'other', 'klingon', ''])('refuses %s without calling the model', async (language) => {
    const spy = anthropicReplies('should not be called')
    vi.stubGlobal('fetch', spy)
    const response = await POST(request({ text: SOURCE, language }, freshIp()))
    expect(await response.json()).toEqual({
      status: 'unavailable', reason: 'unsupported-language',
    })
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('empty and malformed responses', () => {
  it('reports an empty model response', async () => {
    vi.stubGlobal('fetch', anthropicReplies('   '))
    const response = await POST(request({ text: SOURCE, language: 'zh' }, freshIp()))
    expect(await response.json()).toEqual({ status: 'unavailable', reason: 'empty-response' })
  })

  it('reports a malformed model response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => ({ unexpected: true }),
    }))
    const response = await POST(request({ text: SOURCE, language: 'zh' }, freshIp()))
    expect(await response.json()).toEqual({ status: 'unavailable', reason: 'malformed-response' })
  })

  it('reports unparseable JSON from the model', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => { throw new SyntaxError('bad') },
    }))
    const response = await POST(request({ text: SOURCE, language: 'zh' }, freshIp()))
    expect(await response.json()).toEqual({ status: 'unavailable', reason: 'malformed-response' })
  })

  it('reports an unparseable request body', async () => {
    vi.stubGlobal('fetch', anthropicReplies('x'))
    const response = await POST(request('{ not json', freshIp()))
    expect(await response.json()).toEqual({ status: 'unavailable', reason: 'malformed-response' })
  })
})

describe('input limits', () => {
  it('refuses an empty source without calling the model', async () => {
    const spy = anthropicReplies('x')
    vi.stubGlobal('fetch', spy)
    const response = await POST(request({ text: '   ', language: 'zh' }, freshIp()))
    expect(await response.json()).toEqual({
      status: 'unavailable', reason: 'nothing-to-translate',
    })
    expect(spy).not.toHaveBeenCalled()
  })

  it('refuses an oversized source, so the key cannot be spent on a long body', async () => {
    const spy = anthropicReplies('x')
    vi.stubGlobal('fetch', spy)
    const response = await POST(request({ text: 'a'.repeat(2_001), language: 'zh' }, freshIp()))
    expect(await response.json()).toEqual({
      status: 'unavailable', reason: 'nothing-to-translate',
    })
    expect(spy).not.toHaveBeenCalled()
  })

  it('rate limits a single caller', async () => {
    vi.stubGlobal('fetch', anthropicReplies('火距离 2 公里。拨打 000。'))
    const ip = freshIp()
    const results: string[] = []
    for (let i = 0; i < 25; i += 1) {
      const response = await POST(request({ text: SOURCE, language: 'zh' }, ip))
      results.push((await response.json()).status)
    }
    expect(results.filter((s) => s === 'translated').length).toBeLessThanOrEqual(20)
    expect(results.at(-1)).toBe('unavailable')
  })
})
