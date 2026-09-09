import { createMemberSyncCadence } from '../../lib/core/sync/memberSyncCadence.js';

import { loadActiveDesktopSyncRun, runDesktopSyncCoordinator } from './desktopSyncCoordinator.js';

const cadence = createMemberSyncCadence({
  getActiveRun: loadActiveDesktopSyncRun,
  run: () => runDesktopSyncCoordinator('automatic')
});

export function requestDesktopHighValueSync() {
  return cadence.requestMutation('mutation');
}

export function updateDesktopSyncFreshness(eligible: boolean, lastActualSyncAt?: number) {
  cadence.updateFreshness({
    eligible,
    input: eligible ? 'freshness' : null,
    ...(lastActualSyncAt !== undefined ? { lastActualSyncAt } : {})
  });
}
