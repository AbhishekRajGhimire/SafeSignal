import { gsap } from 'gsap'

/**
 * Motion for the emergency screen.
 *
 * One rule governs everything here: motion may draw the eye to information,
 * and may never delay access to it. Elements animate from a visible state,
 * not from opacity zero, so a person who arrives mid-transition, or whose
 * browser drops the animation, still reads the warning. Nothing here gates
 * content on an animation completing.
 *
 * Total budget for a warning arrival is under 400ms.
 */

export const REVEAL_MS = 360

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Settles a warning into place: the level band arrives first because it is
 * the most important thing on the screen, then the meaning, then the rest.
 *
 * The stagger is the point. It gives the eye an order to read in, which is
 * the same order the screen is designed to be read in.
 */
export function revealEmergency(root: HTMLElement): () => void {
  if (prefersReducedMotion()) return () => {}

  const band = root.querySelector('.emergency__band')
  const meaning = root.querySelector('.emergency__meaning')
  const rest = root.querySelectorAll(
    '.emergency__place, .emergency__status, .emergency__action, .speech, .message',
  )

  const timeline = gsap.timeline({ defaults: { ease: 'power2.out' } })

  if (band) {
    timeline.from(band, { yPercent: -100, duration: 0.28 }, 0)
  }
  if (meaning) {
    // From y only, never from opacity 0: the words are legible throughout.
    timeline.from(meaning, { y: 10, duration: 0.3 }, 0.06)
  }
  if (rest.length > 0) {
    timeline.from(rest, { y: 8, opacity: 0.4, duration: 0.26, stagger: 0.035 }, 0.1)
  }

  return () => {
    timeline.kill()
    gsap.set([band, meaning, ...Array.from(rest)].filter(Boolean) as Element[], {
      clearProps: 'all',
    })
  }
}

/**
 * Marks a level that just changed.
 *
 * A single brief lift of the band, not a flash and not a loop. Flashing
 * content is a seizure risk and a distraction at the worst possible moment.
 */
export function markChanged(band: HTMLElement): () => void {
  if (prefersReducedMotion()) return () => {}
  const tween = gsap.fromTo(
    band,
    { scaleY: 1 },
    { scaleY: 1.06, duration: 0.18, yoyo: true, repeat: 1, transformOrigin: 'top center' },
  )
  return () => {
    tween.kill()
    gsap.set(band, { clearProps: 'all' })
  }
}
