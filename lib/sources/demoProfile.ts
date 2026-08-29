import type { UserProfile } from '@/lib/domain/profile'
import type { DemoScenario } from './scenario'

/**
 * Scenario 6 demonstrates a specific accessibility profile, which means demo
 * mode has to change the presenter's own settings and then give them back.
 *
 * The rule is that the person's real profile survives: it is stashed once on
 * the first preset scenario, kept across switches between preset scenarios,
 * and restored on reset, on choosing a scenario with no preset, and on
 * leaving demo mode. Nothing here is stored; the stash lives only as long as
 * the demo session.
 */

export interface ProfileTransition {
  /** Patch to apply to the active profile, or null to leave it alone. */
  patch: Partial<UserProfile> | null
  /** The stash after this transition. */
  stash: UserProfile | null
}

export function enterScenario(
  current: UserProfile,
  stash: UserProfile | null,
  scenario: Pick<DemoScenario, 'profilePreset'>,
): ProfileTransition {
  if (scenario.profilePreset) {
    return {
      patch: scenario.profilePreset,
      // Stash once. Switching from one preset scenario to another must not
      // overwrite the stash with an already-preset profile.
      stash: stash ?? { ...current },
    }
  }
  // A scenario with no preset returns the presenter to their own settings.
  return { patch: stash, stash: null }
}

export function leaveDemo(stash: UserProfile | null): ProfileTransition {
  return { patch: stash, stash: null }
}
