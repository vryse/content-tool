/**
 * Small, optional tactile acknowledgement for deliberate value changes.
 * `vibrate` is absent on most desktop browsers and some mobile browsers, so this
 * remains a no-op unless the current device explicitly exposes the capability.
 */
export function acknowledgeHaptic() {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(8);
  }
}
