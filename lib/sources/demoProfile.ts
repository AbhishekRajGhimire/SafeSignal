import type { UserProfile } from '@/lib/domain/profile'
import type { DemoScenario } from './scenario'

/**
 * Demo mode borrows the presenter's profile and always gives it back.
 *
 * Two things change the profile during a demo. Scenario 6 applies a preset,
 * because it demonstrates a specific accessibility profile. And the presenter
 * may change language or text size by hand to show a judge what those do.
 *
 * Both are borrowed. The whole profile is stashed the moment demo mode
 * begins, survives every scenario switch, and is restored on reset and on
 * leaving demo mode.
 *
 * Stashing on entry rather than on the first preset scenario is what makes a
 * hand-made change reversible: it was previously stashed only when a preset
 * was applied, so changing language through the settings screen wrote
 * straight through to the device and outlived the demo.
 *
 * Nothing here is persisted. The stash lives only as long as the demo
 * session, and `ProfileProvider` stops writing to storage while it exists.
 */

export interface ProfileTransition {
  /** Patch to apply to the active profile, or null to leave it alone. */
  patch: Partial<UserProfile> | null
  /** The stash after this transition. */
  stash: UserProfile | null
}

/**
 * Demo mode has begun. Take a copy of everything and change nothing yet.
 *
 * Must not be called before the stored profile has loaded, or the stash would
 * hold defaults and later overwrite the person's real settings with them.
 */
export function enterDemo(current: UserProfile): ProfileTransition {
  return { patch: null, stash: { ...current } }
}

/**
 * A scenario was chosen. Apply its preset, or return to the presenter's own
 * settings if it has none. Either way the stash survives: the demo is still
 * running and the profile still has to be given back.
 */
export function enterScenario(
  stash: UserProfile | null,
  scenario: Pick<DemoScenario, 'profilePreset'>,
): ProfileTransition {
  if (scenario.profilePreset) return { patch: scenario.profilePreset, stash }
  return { patch: stash, stash }
}

/**
 * Reset demo. Undoes every change the demo made, whether it came from a
 * scenario preset or from the settings screen, and keeps the stash because
 * the presenter has not left demo mode.
 */
export function restoreDemo(stash: UserProfile | null): ProfileTransition {
  return { patch: stash, stash }
}

/** Demo mode is over. Give the profile back and forget it. */
export function leaveDemo(stash: UserProfile | null): ProfileTransition {
  return { patch: stash, stash: null }
}
