import { isNativeCompanionRuntime } from '../../companionBootstrap.js';
import { FolioleCompanionSync } from '../../companionWorkspaceRuntimeRepository.js';

/** Bridges the short gap between back-to-back rounds so the screen does not sleep mid-transfer. */
export const SYNC_SCREEN_AWAKE_LINGER_MS = 10_000;

let holds = 0;
let awake = false;
let linger: ReturnType<typeof setTimeout> | undefined;

function setAwake(active: boolean) {
  if (awake === active) return;
  awake = active;
  // Best effort: a missing or failing host method must never fail the sync round.
  void Promise.resolve().then(() => FolioleCompanionSync.setSyncScreenAwake({ active })).catch(() => undefined);
}

/** Keeps the screen on while any request sync round runs; the returned release is idempotent. */
export function holdCompanionSyncScreenAwake() {
  if (!isNativeCompanionRuntime()) return () => undefined;
  holds += 1;
  clearTimeout(linger);
  linger = undefined;
  setAwake(true);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds -= 1;
    if (holds > 0) return;
    linger = setTimeout(() => {
      linger = undefined;
      setAwake(false);
    }, SYNC_SCREEN_AWAKE_LINGER_MS);
  };
}
