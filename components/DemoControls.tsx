'use client'

import { useWarnings } from './WarningProvider'

/**
 * Presenter controls. English on purpose: this panel is for the person
 * giving the demonstration, never for the person the product serves, and it
 * only renders in demo mode — which is banner-labelled as simulated.
 */
export function DemoControls() {
  const { demo, demoState, scenarios, scenarioId, selectScenario, resetDemo } = useWarnings()
  if (!demo || !demoState) return null

  const multiStep = demoState.totalSteps > 1

  return (
    <section className="democtl" aria-label="Demo controls">
      <h2 className="democtl__title">Demo scenarios</h2>

      <div className="democtl__scenarios">
        {scenarios.map((scenario) => (
          <button
            key={scenario.id}
            type="button"
            className={`choice${scenario.id === scenarioId ? ' choice--selected' : ''}`}
            aria-pressed={scenario.id === scenarioId}
            onClick={() => selectScenario(scenario.id)}
          >
            {scenario.name}
          </button>
        ))}
      </div>

      {multiStep && (
        <div className="democtl__row">
          <button
            type="button"
            className="button button--secondary"
            onClick={() => (demoState.playing ? demo.pause() : demo.play())}
          >
            {demoState.playing ? 'Pause' : 'Play'}
          </button>

          {/* Lets a presenter jump straight to any step. */}
          {Array.from({ length: demoState.totalSteps }, (_, index) => (
            <button
              key={index}
              type="button"
              className={`button ${index === demoState.stepIndex ? '' : 'button--secondary'}`}
              aria-label={`Go to step ${index + 1} of ${demoState.totalSteps}`}
              aria-current={index === demoState.stepIndex ? 'step' : undefined}
              onClick={() => demo.seek(index)}
            >
              {index + 1}
            </button>
          ))}
        </div>
      )}

      {/* One tap back to a known state: default scenario, step 0, paused,
          and the presenter's real profile restored. */}
      <button type="button" className="button button--secondary" onClick={resetDemo}>
        Reset demo
      </button>
    </section>
  )
}
