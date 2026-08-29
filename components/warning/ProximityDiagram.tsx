'use client'

import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { usePack } from '../ProfileProvider'
import { prefersReducedMotion } from '@/lib/motion/reveal'
import type { RelevantWarning } from '@/lib/domain/match'

/**
 * Where you are, relative to the fire area.
 *
 * "You are inside the fire area" is a sentence a person has to convert into
 * a picture in their own head, under stress, possibly in a second language.
 * This draws the picture: a ground plane in perspective, the fire area on
 * it, and you.
 *
 * WHAT IT IS NOT
 *
 * It is not a map. There are no roads, no landmarks, no north, and no
 * direction of travel, because the official feed supports none of those and
 * a diagram that implied them would be inventing an evacuation route. It
 * shows exactly three facts, all of which the feed provides: that a fire
 * area exists, how far away it is, and whether you are within it.
 *
 * It is decorative to assistive technology on purpose: every fact in it is
 * already stated in text directly above, and announcing a schematic twice
 * helps nobody.
 */
export function ProximityDiagram({ relevant }: { relevant: RelevantWarning }) {
  const pack = usePack()
  const root = useRef<SVGSVGElement>(null)

  const inside = relevant.verdict === 'affected'
  const distanceKm = relevant.distanceKm
  // Nothing to draw without either containment or a distance. Computed
  // before the effect so the hook order never changes between renders.
  const drawable = inside || distanceKm !== null

  useEffect(() => {
    const svg = root.current
    if (!svg || !drawable || prefersReducedMotion()) return

    const stage = svg.closest('.pd__stage')
    const rings = svg.querySelectorAll('.pd__ring')
    const area = svg.querySelector('.pd__area')
    const you = stage?.querySelector('.pd__pin') ?? null

    const tl = gsap.timeline({ defaults: { ease: 'power2.out' } })
    // The ground settles first, then the fire, then you. The order is the
    // order the picture is meant to be read in.
    tl.from(rings, { scale: 0.92, opacity: 0.2, duration: 0.4, stagger: 0.05, transformOrigin: 'center' }, 0)
    if (area) tl.from(area, { scale: 0.8, opacity: 0.3, duration: 0.45, transformOrigin: 'center' }, 0.12)
    // The pin drops onto the plane. It is the last thing to arrive, so the
    // eye lands on it after the ground it stands on has been read.
    if (you) tl.from(you, { y: -18, opacity: 0.4, duration: 0.42, ease: 'power3.out' }, 0.26)

    return () => {
      tl.kill()
      gsap.set([...Array.from(rings), area, you].filter(Boolean) as Element[], { clearProps: 'all' })
    }
  }, [inside, distanceKm, drawable])

  if (!drawable) return null

  // Inside means the area covers you, so it is drawn around the centre.
  // Outside, it sits away from you at a distance the rings can be read
  // against - never in a compass direction, because the feed has none.
  const offset = Math.min(64, 26 + (distanceKm ?? 0) * 2.6)

  const label = inside
    ? pack.ui.youAreInside
    : `${distanceKm?.toFixed(1)} ${pack.ui.kmAway}`

  return (
    <figure className={`pd${inside ? ' pd--inside' : ''}`}>
      <div className="pd__stage">
        <svg
          ref={root}
          className="pd__svg"
          viewBox="0 0 200 200"
          role="img"
          aria-hidden="true"
          focusable="false"
        >
          {/* Distance rings. A scale to read depth against, not a map. */}
          {[34, 62, 90].map((r) => (
            <circle key={r} className="pd__ring" cx="100" cy="100" r={r} />
          ))}

          {/* The fire area. Soft edged, because its boundary is an estimate
              and a hard edge would claim precision the feed does not have. */}
          <circle
            className="pd__area"
            cx="100"
            cy={inside ? 100 : 100 - offset}
            r={inside ? 58 : 30}
          />

          {/* The shadow the pin casts on the plane. This is the cue that
              makes the tilt read as ground rather than as an ellipse. */}
          <ellipse className="pd__shadow" cx="100" cy="100" rx="10" ry="10" />
        </svg>

        {/*
          You, standing on the plane rather than lying in it.

          The ground tilts and the pin does not, which is the whole reason
          the diagram reads as space. A pin drawn inside the tilted SVG
          would lie flat with it and the third dimension would vanish.
        */}
        <div className="pd__pin" aria-hidden="true">
          <span className="pd__stem" />
          <span className="pd__head" />
        </div>
      </div>

      {/* The caption carries the same fact as the text above it, so the
          diagram never becomes the only place something is said. */}
      <figcaption className="pd__caption">{label}</figcaption>
    </figure>
  )
}
