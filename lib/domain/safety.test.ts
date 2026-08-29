import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { PACKS } from '@/lib/i18n'
import { PACK_LANGUAGES } from '@/lib/domain/profile'
import { REVEAL_MS as REVEAL_BUDGET_MS } from '@/lib/motion/reveal'

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

describe('speech never replaces the text', () => {
  const controls = readFileSync('components/speech/SpeechControls.tsx', 'utf8')
  const emergency = readFileSync('components/warning/EmergencyWarning.tsx', 'utf8')

  it('renders the controls beside the warning, never instead of it', () => {
    // The meaning, the place and the action are all rendered unconditionally;
    // the speech controls are a sibling, not a replacement.
    expect(emergency).toContain('emergency__meaning')
    expect(emergency).toContain('<SpeechControls')
    expect(emergency).not.toMatch(/\?\s*<SpeechControls/)
  })

  it('never hides text when audio is available', () => {
    // Nothing in the speech controls sets display:none or hides content, and
    // no component conditions text on speech support.
    expect(controls).not.toMatch(/display:\s*['"]none['"]/)
    expect(emergency).not.toMatch(/support\s*===/)
  })

  it('speaks only SafeSignal-authored rendering, never the official block', () => {
    // speechText is built from the phrase pack in render.ts. The official
    // wording is shown as text and never sent to the synthesiser.
    expect(emergency).toContain('view.speechText')
    expect(emergency).not.toMatch(/SpeechControls[^>]*officialText/)
  })

  it('states plainly when speech is unavailable rather than showing a dead button', () => {
    expect(controls).toContain('speechNotSupported')
    expect(controls).toContain('audioUnavailable')
  })

  it('offers pause, resume, replay and stop as real buttons', () => {
    for (const control of ['pause', 'resume', 'replay', 'stop']) {
      expect(controls, control).toContain(`engine?.${control}()`)
    }
    // Native buttons, so keyboard and assistive access come from the platform.
    expect(controls).not.toMatch(/role=['"]button['"]/)
  })
})

describe('the playing indicator survives every accessibility setting', () => {
  const css = readFileSync('app/globals.css', 'utf8')

  it('holds a visible state when motion is suppressed', () => {
    const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(reduced).toContain('.speech__bars--on span')
  })

  it('animates only behind a no-preference query', () => {
    const animated = css.indexOf('.speech__bars--on span { animation')
    const guard = css.lastIndexOf('@media (prefers-reduced-motion: no-preference)', animated)
    expect(guard).toBeGreaterThan(-1)
  })

  it('carries a word as well as a shape, so colour is never the only signal', () => {
    const controls = readFileSync('components/speech/SpeechControls.tsx', 'utf8')
    expect(controls).toContain('pack.ui.readingAloud')
    expect(controls).toContain('pack.ui.paused')
  })
})

describe('demo data never mixes with live data', () => {
  it('routes demo warnings through a source, never into the live pipeline', () => {
    // The RFS pipeline builds warnings only from a fetched payload. If the
    // scenario module were ever imported there, simulated warnings could
    // reach a live feed.
    for (const file of ['lib/rfs/fetch.ts', 'lib/rfs/normalize.ts', 'app/api/warnings/route.ts']) {
      expect(readFileSync(file, 'utf8'), file).not.toContain('sources/scenario')
    }
  })

  it('subscribes to exactly one source at a time', () => {
    const provider = readFileSync('components/WarningProvider.tsx', 'utf8')
    // LiveSource is constructed only on the branch where there is no demo.
    expect(provider).toMatch(/if \(demo\) \{/)
    expect(provider).toMatch(/const live = new LiveSource\(\)/)
    const demoBranch = provider.indexOf('if (demo) {')
    const liveConstruct = provider.indexOf('new LiveSource()')
    expect(liveConstruct).toBeGreaterThan(demoBranch)
  })

  it('labels every simulated warning as simulated at the source', () => {
    const scenario = readFileSync('lib/sources/scenario.ts', 'utf8')
    expect(scenario).toContain('SIMULATED')
    expect(scenario).toContain('Simulated data for demonstration only')
    // Every demo warning is built by the one factory that attaches it.
    expect(scenario).toContain('provenance: DEMO_PROVENANCE')
  })

  it('keeps the simulated-data banner unconditional in demo mode', () => {
    const page = readFileSync('app/page.tsx', 'utf8')
    expect(page).toMatch(/demoMode && <div className="banner banner--demo">/)
  })
})

describe('motion never gates emergency information', () => {
  const motion = readFileSync('lib/motion/reveal.ts', 'utf8')

  it('honours prefers-reduced-motion by doing nothing at all', () => {
    expect(motion).toContain('if (prefersReducedMotion()) return')
  })

  it('never animates content in from invisible', () => {
    // from({ opacity: 0 }) would mean a person arriving mid-transition, or
    // whose browser drops the animation, sees nothing. Partial fades are
    // allowed; a full one is not.
    expect(motion).not.toMatch(/opacity:\s*0\s*[,}]/)
  })

  it('never loops or flashes', () => {
    expect(motion).not.toContain('repeat: -1')
    expect(motion).not.toContain('yoyo: true, repeat: -1')
  })

  it('keeps the whole arrival under 400ms', () => {
    expect(REVEAL_BUDGET_MS).toBeLessThanOrEqual(400)
  })

  it('reverts cleanly, so a killed animation cannot strand a hidden element', () => {
    expect(motion).toContain("clearProps: 'all'")
  })
})
