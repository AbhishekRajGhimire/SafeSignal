'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { usePack, useProfile } from '../ProfileProvider'
import { prefersReducedMotion } from '@/lib/motion/reveal'
import { boundsOf, padBounds, projector, ringToPath } from '@/lib/domain/projection'
import { usablePolygons } from '@/lib/domain/geo'
import type { RelevantWarning } from '@/lib/domain/match'

const VIEW = 200

/**
 * The official fire area, drawn, with your position in it.
 *
 * This renders the actual polygon the NSW RFS published, not an
 * illustration of one. The shape, the scale and where you sit inside it are
 * all the feed's own geometry.
 *
 * WHAT IT DELIBERATELY IS NOT
 *
 * There are no map tiles. A tile map requests imagery for the area you are
 * standing in, which tells the tile provider where you are, and SafeSignal's
 * whole privacy claim is that your location never leaves the device. Tiles
 * would also stop this working offline, which is when it matters most.
 *
 * There is no route, no arrow and no suggested direction. Deciding which way
 * to go from two polygons would be inventing evacuation advice: the fire
 * moves, roads close, and an area with no polygon on it has not been
 * declared safe by anyone. When the RFS gives a direction it appears in the
 * official wording below, in their words, and that is the only place a
 * direction ever comes from.
 */
export function ProximityDiagram({ relevant }: { relevant: RelevantWarning }) {
  const pack = usePack()
  const { profile } = useProfile()
  const root = useRef<SVGSVGElement>(null)
  const [tilt, setTilt] = useState(46)

  const inside = relevant.verdict === 'affected'
  const distanceKm = relevant.distanceKm
  const at = profile.location

  const shape = useMemo(() => {
    const { usable } = usablePolygons(relevant.warning.polygons)
    if (usable.length === 0) return null

    const extra = at ? [{ lat: at.lat, lon: at.lon }] : []
    const raw = boundsOf(usable, extra)
    if (!raw) return null

    const project = projector(padBounds(raw), VIEW)
    return {
      paths: usable.map((ring) => ringToPath(ring, project)).filter(Boolean),
      you: at ? project({ lat: at.lat, lon: at.lon }) : null,
      centre: relevant.warning.point ? project(relevant.warning.point) : null,
    }
  }, [relevant.warning.polygons, relevant.warning.point, at])

  const drawable = shape !== null || inside || distanceKm !== null

  useEffect(() => {
    const svg = root.current
    if (!svg || !drawable || prefersReducedMotion()) return

    const stage = svg.closest('.pd__stage')
    const rings = svg.querySelectorAll('.pd__ring')
    const area = svg.querySelectorAll('.pd__area')
    const you = stage?.querySelector('.pd__pin') ?? null

    const tl = gsap.timeline({ defaults: { ease: 'power2.out' } })
    tl.from(rings, { scale: 0.92, opacity: 0.2, duration: 0.4, stagger: 0.05, transformOrigin: 'center' }, 0)
    if (area.length) {
      tl.from(area, { scale: 0.88, opacity: 0.3, duration: 0.45, transformOrigin: 'center' }, 0.12)
    }
    if (you) tl.from(you, { y: -18, opacity: 0.4, duration: 0.42, ease: 'power3.out' }, 0.26)

    return () => {
      tl.kill()
      gsap.set([...Array.from(rings), ...Array.from(area), you].filter(Boolean) as Element[],
        { clearProps: 'all' })
    }
  }, [inside, distanceKm, shape, drawable])

  const nudge = (delta: number) => setTilt((t) => Math.min(74, Math.max(8, t + delta)))

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (prefersReducedMotion()) return
    const startY = event.clientY
    const startTilt = tilt
    const target = event.currentTarget
    target.setPointerCapture(event.pointerId)
    const move = (e: PointerEvent) =>
      setTilt(Math.min(74, Math.max(8, startTilt + (e.clientY - startY) * 0.35)))
    const up = () => {
      target.releasePointerCapture(event.pointerId)
      target.removeEventListener('pointermove', move)
      target.removeEventListener('pointerup', up)
    }
    target.addEventListener('pointermove', move)
    target.addEventListener('pointerup', up)
  }

  if (!drawable) return null

  // Without published geometry there is no shape to draw, so the view falls
  // back to a distance ring. It says less because the feed said less.
  const fallbackRadius = inside ? 58 : 30
  const fallbackY = inside ? 100 : 100 - Math.min(64, 26 + (distanceKm ?? 0) * 2.6)

  const label = inside
    ? pack.ui.youAreInside
    : distanceKm !== null
      ? `${distanceKm.toFixed(1)} ${pack.ui.kmAway}`
      : ''

  return (
    <figure className={`pd${inside ? ' pd--inside' : ''}`}>
      <div
        className="pd__stage"
        style={{ ['--pd-tilt' as string]: `${tilt}deg` }}
        onPointerDown={onPointerDown}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp') { nudge(-6); e.preventDefault() }
          if (e.key === 'ArrowDown') { nudge(6); e.preventDefault() }
        }}
        role="group"
        tabIndex={0}
        aria-label={pack.ui.tiltDiagram}
      >
        <svg
          ref={root}
          className="pd__svg"
          viewBox={`0 0 ${VIEW} ${VIEW}`}
          role="img"
          aria-hidden="true"
          focusable="false"
        >
          {[34, 62, 90].map((r) => (
            <circle key={r} className="pd__ring" cx="100" cy="100" r={r} />
          ))}

          {shape
            ? shape.paths.map((d, i) => <path key={i} className="pd__area" d={d} />)
            : <circle className="pd__area" cx="100" cy={fallbackY} r={fallbackRadius} />}

          <ellipse
            className="pd__shadow"
            cx={shape?.you?.x ?? 100}
            cy={shape?.you?.y ?? 100}
            rx="10"
            ry="10"
          />
        </svg>

        {/* You. Upright while the ground tilts away beneath it. */}
        <div
          className="pd__pin"
          aria-hidden="true"
          style={
            shape?.you
              ? {
                  left: `${(shape.you.x / VIEW) * 100}%`,
                  top: `${(shape.you.y / VIEW) * 100}%`,
                }
              : undefined
          }
        >
          <span className="pd__stem" />
          <span className="pd__head" />
        </div>
      </div>

      <figcaption className="pd__caption">
        {label}
        {/* An area with no polygon on it has not been declared safe. Saying
            so here is the difference between a diagram and a promise. */}
        <span className="pd__disclaimer">{pack.ui.diagramNotAMap}</span>
      </figcaption>
    </figure>
  )
}
