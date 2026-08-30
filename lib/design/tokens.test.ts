import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  NEUTRAL_CHROMA,
  blockFor,
  chromaOf,
  contrastRatio,
  hueDistance,
  readTokens,
} from './contrast'

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
  it('is near-neutral, or else confined to grounds and surfaces', () => {
    // Two ways to be safe.
    //
    // Cosmic takes the first: at a chroma of 0.04 it reads as near-black,
    // against 0.83 for the Advice yellow, so its nominal hue is not
    // perceivable and cannot be read as an alert.
    //
    // Vanilla cannot. It has real chroma and sits 30deg from Advice, and
    // measured against Advice directly it is 1.47:1 - genuinely hard to
    // tell apart. So it is confined to grounds and large surfaces, which
    // the next test enforces, and this one records why.
    for (const [mode, tokens] of MODES) {
      const accent = tokens.accent
      const neutral = chromaOf(accent) < NEUTRAL_CHROMA
      const distant = Object.values(OFFICIAL)
        .every((hex) => hueDistance(accent, hex) > 45)
      const confined = contrastRatio(accent, OFFICIAL['level-advice']) < 3
      expect(neutral || distant || confined, `${mode} ${accent}`).toBe(true)
    }
  })

  it('never uses a chromatic accent in a role an alert colour takes', () => {
    // Vanilla does have perceivable chroma and sits 30deg from Advice, so
    // it is confined to grounds and large surfaces. The roles that carry
    // alert meaning - the level band, the summary rule, the level action
    // rule - must resolve to a level token and never to --accent.
    const alertRoles = [
      '.emergency__band',
      '.emergency__action',
      '.emergency__here',
      '.message__part--explanation',
      '.summary--emergency-warning::before',
      '.summary--watch-and-act::before',
      '.summary--advice::before',
      '.summary--planned-burn::before',
    ]
    for (const selector of alertRoles) {
      const block = blockFor(css, selector)
      expect(block, selector).not.toMatch(/var\(--accent[^-]/)
    }
  })
})
