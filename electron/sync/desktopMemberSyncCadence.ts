import { requestAttachmentWorkYield } from '../../lib/core/sync/attachmentWorkBudget.js';
import { createMemberSyncCadence } from '../../lib/core/sync/memberSyncCadence.js';

import { desktopSyncChangeSessions } from './desktopSyncChangeSessions.js';
import {
  loadActiveDesktopSyncRun,
  runDesktopSyncCoordinator,
  subscribeDesktopSyncCompleted
} from './desktopSyncCoordinator.js';

const cadence = createMemberSyncCadence({
  didSync: (result) => (result as { status?: string })?.status === 'completed',
  getActiveRun: loadActiveDesktopSyncRun,
  run: () => runDesktopSyncCoordinator('automatic')
});

subscribeDesktopSyncCompleted(() => cadence.markActualSync());

export function requestDesktopHighValueSync() {
  desktopSyncChangeSessions().changed();
  return requestDesktopRelaySync();
}

export function requestDesktopRelaySync() {
  requestAttachmentWorkYield();
  return cadence.requestMutation('mutation');
}

export function updateDesktopSyncFreshness(eligible: boolean, lastActualSyncAt?: number) {
  cadence.updateFreshness({
    eligible,
    input: eligible ? 'freshness' : null,
    ...(lastActualSyncAt !== undefined ? { lastActualSyncAt } : {})
  });
}
