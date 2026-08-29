import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { blockFor, contrastRatio, hueDistance, readTokens } from './contrast'

/**
 * The design tokens are held to WCAG by test, not by memory.
 *
 * An earlier build shipped a Watch and Act badge at 3.84:1 and form borders
 * at 1.39:1, because contrast was checked once by hand and then edited.
 * This is the guard against that recurring.
 */

const css = readFileSync('app/globals.css', 'utf8')
const light = readTokens(blockFor(css, ':root {'))
const dark = readTokens(blockFor(css, ':root[data-theme="dark"]'))

const MODES: [string, Record<string, string>][] = [
  ['light', light],
  ['dark', dark],
]

const OFFICIAL: Record<string, string> = {
  'level-emergency-warning': '#c8102e',
  'level-watch-and-act': '#e35205',
  'level-advice': '#ffc72c',
  'level-planned-burn': '#0072ce',
}

describe('semantic tokens exist in both modes', () => {
  const required = [
    'bg', 'surface', 'surface-sunk', 'text', 'text-2',
    'border', 'border-soft', 'accent', 'accent-surface', 'focus',
  ]

  it.each(MODES)('%s defines every semantic token', (_mode, tokens) => {
    for (const name of required) {
      expect(tokens[name], name).toMatch(/^#[0-9a-fA-F]{6}$/)
    }
  })
})

describe('text contrast', () => {
  it.each(MODES)('%s: primary text clears AAA on surface and background', (_m, t) => {
    expect(contrastRatio(t.text, t.surface)).toBeGreaterThanOrEqual(7)
    expect(contrastRatio(t.text, t.bg)).toBeGreaterThanOrEqual(7)
  })

  it.each(MODES)('%s: secondary text clears AAA, not merely AA', (_m, t) => {
    // The project target is 7:1 for body. An earlier --ink-muted sat at
    // 6.39:1 and passed AA while missing the project's own bar.
    expect(contrastRatio(t['text-2'], t.surface)).toBeGreaterThanOrEqual(7)
  })

  it.each(MODES)('%s: text is readable on the accent surface', (_m, t) => {
    expect(contrastRatio(t.text, t['accent-surface'])).toBeGreaterThanOrEqual(4.5)
  })
})

describe('non-text contrast, WCAG 1.4.11', () => {
  it.each(MODES)('%s: borders clear 3:1 against surface', (_m, t) => {
    expect(contrastRatio(t.border, t.surface)).toBeGreaterThanOrEqual(3)
  })

  it.each(MODES)('%s: the focus ring clears 3:1 against every ground', (_m, t) => {
    for (const ground of ['surface', 'bg', 'surface-sunk']) {
      expect(contrastRatio(t.focus, t[ground]), ground).toBeGreaterThanOrEqual(3)
    }
  })
})

describe('the official RFS alert colours are never restyled', () => {
  it('uses the exact published hex for every alert level', () => {
    for (const [token, hex] of Object.entries(OFFICIAL)) {
      expect(light[token]?.toLowerCase(), token).toBe(hex)
    }
  })

  it('does not redefine an alert colour in dark mode', () => {
    // A dark theme may restyle our chrome. It may not restyle a warning
    // level, because that meaning belongs to the RFS and not to us.
    for (const token of Object.keys(OFFICIAL)) {
      expect(dark[token], token).toBeUndefined()
    }
  })

  it('pairs every alert colour with ink that clears AA', () => {
    for (const token of Object.keys(OFFICIAL)) {
      const ink = light[`${token}-ink`]
      expect(ink, `${token}-ink`).toBeDefined()
      expect(contrastRatio(ink, light[token]), token).toBeGreaterThanOrEqual(4.5)
    }
  })
})

describe('the chrome accent cannot be mistaken for an alert level', () => {
  it('keeps the accent well away from every official hue, in both modes', () => {
    // Every other approved accent collides: Morlet Red sits 4deg from
    // Emergency, Cool Blue 2deg from Advice, Candy Blue 8deg from Planned
    // Burn, Turquoise 33deg, Lime 33deg, Orchid 41deg. Violet is 52deg.
    for (const [mode, tokens] of MODES) {
      for (const hex of Object.values(OFFICIAL)) {
        expect(hueDistance(tokens.accent, hex), `${mode} ${tokens.accent} vs ${hex}`)
          .toBeGreaterThan(45)
      }
    }
  })
})
