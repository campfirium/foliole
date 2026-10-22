import { requestAttachmentWorkYield } from '../../lib/core/sync/attachmentWorkBudget.js';
import { createMemberSyncCadence } from '../../lib/core/sync/memberSyncCadence.js';

import { desktopSyncChangeSessions } from './desktopSyncChangeSessions.js';
import {
  loadActiveDesktopSyncRun,
  runDesktopSyncCoordinator,
  subscribeDesktopSyncCompleted
} from './desktopSyncCoordinator.js';

/** The only peer a pending run may skip: it pushed every change that queued the run. */
let relaySourceOnly: string | null | undefined;

const cadence = createMemberSyncCadence({
  didSync: (result) => (result as { status?: string })?.status === 'completed',
  getActiveRun: loadActiveDesktopSyncRun,
  run: (input: string) => {
    const skipped = input === 'mutation' ? relaySourceOnly ?? undefined : undefined;
    relaySourceOnly = undefined;
    return runDesktopSyncCoordinator('automatic', undefined, false, skipped);
  }
});

subscribeDesktopSyncCompleted(() => cadence.markActualSync());

export function requestDesktopHighValueSync() {
  desktopSyncChangeSessions().changed();
  return requestMutationRun(null);
}

/** An inbound commit already exists on the pushing peer, so only the other peers need it. */
export function requestDesktopRelaySync(sourcePeerId: string) {
  return requestMutationRun(sourcePeerId);
}

function requestMutationRun(source: string | null) {
  relaySourceOnly = relaySourceOnly === undefined || relaySourceOnly === source ? source : null;
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
