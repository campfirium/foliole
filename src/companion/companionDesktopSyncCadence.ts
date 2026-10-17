import type { MemberSyncCadence } from '../../lib/core/sync/memberSyncCadence';
import { subscribeCompanionDesktopChanges } from '../shared/platform/companion/network/companionDesktopSession.js';

import type { ForegroundSyncReason } from './companionForegroundSyncRunner';

export function subscribeDesktopSyncCadence(cadence: MemberSyncCadence<ForegroundSyncReason>) {
  return subscribeCompanionDesktopChanges(async () => {
    void cadence.requestMutation('mutation')?.catch(() => undefined);
  });
}
