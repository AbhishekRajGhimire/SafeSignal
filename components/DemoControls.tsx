'use client'

import { usePack } from './ProfileProvider'
import type { DemoSource, DemoState } from '@/lib/sources/demo'

export function DemoControls({ demo, state }: { demo: DemoSource; state: DemoState }) {
  const pack = usePack()

  return (
    <div className="card stack">
      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        <button
          type="button"
          className="button button--secondary"
          onClick={() => (state.playing ? demo.pause() : demo.play())}
        >
          {state.playing ? pack.ui.demoPause : pack.ui.demoPlay}
        </button>
        <button type="button" className="button button--secondary" onClick={() => demo.restart()}>
          {pack.ui.demoRestart}
        </button>
      </div>

      {/* Lets a presenter jump straight to the emergency warning. */}
      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        {Array.from({ length: state.totalSteps }, (_, index) => (
          <button
            key={index}
            type="button"
            className={`button ${index === state.stepIndex ? '' : 'button--secondary'}`}
            aria-current={index === state.stepIndex ? 'step' : undefined}
            onClick={() => demo.seek(index)}
          >
            {index + 1}
          </button>
        ))}
      </div>
    </div>
  )
}
