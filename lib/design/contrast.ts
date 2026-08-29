/**
 * WCAG relative luminance and contrast, used by the design-token tests.
 *
 * Accessibility claims in this project are calculated, not eyeballed. This
 * is the calculator.
 */

export function relativeLuminance(hex: string): number {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const channel = (i: number) => {
    const c = parseInt(full.slice(i, i + 2), 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4)
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

/** Hue in degrees, for checking an accent against the official alert hues. */
export function hueOf(hex: string): number {
  const h = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (max === min) return 0
  const d = max - min
  let deg: number
  if (max === r) deg = ((g - b) / d) % 6
  else if (max === g) deg = (b - r) / d + 2
  else deg = (r - g) / d + 4
  return (deg * 60 + 360) % 360
}

export function hueDistance(a: string, b: string): number {
  const d = Math.abs(hueOf(a) - hueOf(b))
  return Math.min(d, 360 - d)
}

/** Parses `--name: #rrggbb;` declarations out of a CSS block. */
export function readTokens(css: string): Record<string, string> {
  const tokens: Record<string, string> = {}
  for (const match of css.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
    tokens[match[1]] = match[2]
  }
  return tokens
}

/** The block between a selector and its closing brace. */
export function blockFor(css: string, selector: string): string {
  const at = css.indexOf(selector)
  if (at === -1) throw new Error(`selector not found: ${selector}`)
  const open = css.indexOf('{', at)
  const close = css.indexOf('}', open)
  return css.slice(open, close)
}
