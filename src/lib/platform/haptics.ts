// Haptic feedback (Blueprint §8). Owner: step 1.4.
//
// - Uses `navigator.vibrate`; silently does nothing where unsupported (iOS, desktop) or before the
//   user has interacted with the page (Chrome blocks vibrate without user activation).
// - User-toggleable: `localStorage['homecare.haptics']` = 'off' disables, anything else (or missing)
//   means on. Settings (4.3) calls `setHapticsEnabled()`.
//
// Usage:  import { haptic } from '$lib/platform/haptics';   haptic('complete');

/** Vibration patterns in ms. take/complete/jarFull are from the blueprint; the rest are light ticks. */
export const HAPTIC_PATTERNS = {
  /** "אני לוקח/ת", swipe-to-snooze. */
  take: 12,
  /** Task completed (the CompletionCircle fires this). */
  complete: [10, 40, 18],
  /** The treat jar filled up. */
  jarFull: [20, 60, 20, 60, 40],
  /** A selection changed (segmented control, toggle, stepper). Barely-there. */
  select: 6,
  /** Something needs attention (validation error, conflict). */
  warn: [16, 50, 16]
} as const satisfies Record<string, number | readonly number[]>;

export type HapticName = keyof typeof HAPTIC_PATTERNS;

export const HAPTICS_STORAGE_KEY = 'homecare.haptics';

/** Whether the user allows haptics (default: on). */
export function isHapticsEnabled(): boolean {
  try {
    return globalThis.localStorage?.getItem(HAPTICS_STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

/** Persists the user's haptics preference. */
export function setHapticsEnabled(on: boolean): void {
  try {
    globalThis.localStorage?.setItem(HAPTICS_STORAGE_KEY, on ? 'on' : 'off');
  } catch {
    // Storage unavailable (private mode): the preference simply doesn't persist.
  }
}

/** Whether this device can vibrate at all (for showing/hiding the Settings toggle). */
export function hapticsSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

/** Plays a named haptic pattern. Returns true when a vibration was actually requested. */
export function haptic(name: HapticName): boolean {
  if (!hapticsSupported() || !isHapticsEnabled()) return false;
  // Chrome rejects vibrate() before any user gesture and logs an intervention; skip quietly.
  const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } })
    .userActivation;
  if (activation && !activation.hasBeenActive) return false;
  const pattern = HAPTIC_PATTERNS[name];
  try {
    return navigator.vibrate(typeof pattern === 'number' ? pattern : [...pattern]);
  } catch {
    return false;
  }
}
