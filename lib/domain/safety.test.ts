import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { PACKS } from '@/lib/i18n'
import { PACK_LANGUAGES } from '@/lib/domain/profile'

/**
 * Standing safety rules, enforced rather than remembered.
 *
 * SafeSignal must never tell anyone they are safe, never generate an
 * evacuation route, and never invent emergency instructions. These are the
 * rules most likely to be broken by a well-meaning future change, so they are
 * asserted against the source itself.
 */

const ROOTS = ['lib', 'app', 'components']

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      if (entry === 'node_modules' || entry === '__fixtures__') continue
      sourceFiles(path, out)
    } else if (/\.tsx?$/.test(entry) && !entry.includes('.test.')) {
      out.push(path)
    }
  }
  return out
}

const FILES = ROOTS.flatMap((root) => sourceFiles(root))

describe('never tells anyone they are safe', () => {
  it('has no English phrase claiming safety', () => {
    const forbidden = /\b(you are safe|it is safe|safe to stay|safe now|all clear|no danger)\b/i
    for (const key of Object.keys(PACKS.en.ui) as (keyof typeof PACKS.en.ui)[]) {
      expect(PACKS.en.ui[key], `en.ui.${key}`).not.toMatch(forbidden)
    }
    for (const level of Object.keys(PACKS.en.levelMeaning) as (keyof typeof PACKS.en.levelMeaning)[]) {
      expect(PACKS.en.levelMeaning[level], `levelMeaning.${level}`).not.toMatch(forbidden)
      expect(PACKS.en.levelAction[level], `levelAction.${level}`).not.toMatch(forbidden)
    }
  })

  it('describes the absence of warnings without implying safety, in every language', () => {
    for (const language of PACK_LANGUAGES) {
      const body = PACKS[language].ui.noWarningsTitle + ' ' + PACKS[language].ui.noWarningsBody
      expect(body.length, language).toBeGreaterThan(0)
    }
    // The English wording is a factual statement about warnings, not about
    // the person: "There are no warnings near you right now".
    expect(PACKS.en.ui.noWarningsTitle).toMatch(/no warnings/i)
    expect(PACKS.en.ui.noWarningsTitle).not.toMatch(/\bsafe\b/i)
  })
})

describe('never generates evacuation routes or instructions', () => {
  it('contains no routing or direction-finding code', () => {
    const forbidden = /\b(calculateRoute|buildRoute|evacuationRoute|planRoute|directionsTo|navigateTo)\b/
    for (const file of FILES) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(forbidden)
    }
  })

  it('takes no dependency on a routing or mapping service', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
    const routing = /mapbox|leaflet|google-maps|osrm|graphhopper|turf|directions/i
    for (const dep of deps) expect(dep, dep).not.toMatch(routing)
  })

  it('keeps SafeSignal-authored guidance to level actions, which are not routes', () => {
    // Level actions tell someone to follow the official advice. They never
    // name a road, a direction, or a destination.
    const directions = /\b(head (north|south|east|west)|take the .* road|drive to|route via)\b/i
    for (const level of Object.keys(PACKS.en.levelAction) as (keyof typeof PACKS.en.levelAction)[]) {
      expect(PACKS.en.levelAction[level], level).not.toMatch(directions)
    }
  })
})

describe('never invents emergency advice', () => {
  it('leaves rawAdvice to the feed and never assigns authored text to it', () => {
    const assignment = /rawAdvice:\s*['"`]/
    for (const file of FILES) {
      // The demo scenario is the one place authored text exists, and it is
      // labelled simulated in its provenance and banner.
      if (file.includes('sources/scenario.ts')) continue
      expect(readFileSync(file, 'utf8'), file).not.toMatch(assignment)
    }
  })

  it('marks every checklist item with where its wording came from', () => {
    const source = readFileSync('lib/help/checklist.ts', 'utf8')
    expect(source).toContain("source: 'nsw-rfs'")
    expect(source).toContain("source: 'safesignal'")
  })
})

describe('the language layer never replaces the official message', () => {
  it('always renders the official text, whatever the translation did', () => {
    const source = readFileSync('components/warning/OfficialBlock.tsx', 'utf8')
    // The official <pre> is unconditional; only the explanation is guarded.
    expect(source).toMatch(/<pre className="message__official" lang="en">/)
    const officialIndex = source.indexOf('message__official')
    const guardIndex = source.indexOf('wantsTranslation &&')
    expect(officialIndex).toBeGreaterThan(-1)
    expect(guardIndex).toBeGreaterThan(officialIndex)
  })

  it('labels SafeSignal output as SafeSignal output, never as official', () => {
    const source = readFileSync('components/warning/OfficialBlock.tsx', 'utf8')
    expect(source).toContain('explanationLabel')
    expect(source).toContain('officialMessageLabel')
    // Regression guard: an earlier build labelled the AI explanation with
    // `officialWording`, which read as if the model had written the warning.
    expect(source).not.toContain('officialWording')
  })

  it('sends only feed-authored free text to the model', () => {
    const source = readFileSync('components/warning/OfficialBlock.tsx', 'utf8')
    expect(source).toContain('useTranslation(warning.rawAdvice')
  })

  it('never sends a phrase pack to the model', () => {
    for (const file of FILES) {
      const source = readFileSync(file, 'utf8')
      if (!source.includes('/api/translate')) continue
      expect(source, file).not.toMatch(/pack\.(levelAction|levelMeaning|levelName)/)
    }
  })
})
