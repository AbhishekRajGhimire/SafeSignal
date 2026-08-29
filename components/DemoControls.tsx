'use client'

import type { DemoSource, DemoState } from '@/lib/sources/demo'

export function DemoControls({ demo, state }: { demo: DemoSource; state: DemoState }) {
  return (
    <div className="card stack">
      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        <button
          type="button"
          className="button button--secondary"
          onClick={() => (state.playing ? demo.pause() : demo.play())}
        >
          {state.playing ? 'Pause' : 'Play'}
        </button>
        <button type="button" className="button button--secondary" onClick={() => demo.restart()}>
          Restart
        </button>
      </div>

      {/* Lets a presenter jump straight to the emergency warning. */}
      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        {Array.from({ length: state.totalSteps }, (_, index) => (
          <button
            key={index}
            type="button"
            className={`button ${index === state.stepIndex ? '' : 'button--secondary'}`}
            onClick={() => demo.seek(index)}
          >
            {index + 1}
          </button>
        ))}
      </div>
    </div>
  )
}
