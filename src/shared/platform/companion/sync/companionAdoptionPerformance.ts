import { App } from '@capacitor/app';

import {
  finishRequestSyncPerformance, requestSyncPerformance, startRequestSyncPerformance
} from '../../../../../lib/core/sync/requestSyncPerformance.js';
import type { CompanionDesktopSyncResult } from '../../companionDesktopSyncTypes';

export async function measureCompanionAdoption(
  label: string, run: () => Promise<CompanionDesktopSyncResult>
) {
  let identity: Awaited<ReturnType<typeof App.getInfo>> | undefined;
  try {
    identity = await App.getInfo();
  } catch {
    // Diagnostics must not block library reception if native app info is unavailable.
  }
  if (identity?.id !== 'com.campfirium.foliole.android.acceptance' || requestSyncPerformance) return run();

  startRequestSyncPerformance();
  let outcome: Parameters<typeof finishRequestSyncPerformance>[0] = 'failed';
  try {
    const result = await run();
    const finished = result.remainingStructureChangeCount === 0 && result.remainingAttachmentResourceCount === 0;
    outcome = result.attachmentResourceError ? 'failed' : finished ? 'complete' : 'partial';
    return result;
  } finally {
    console.info('[sync-performance]', JSON.stringify({
      label, role: 'receiver', scope: 'adoption_attempt',
      unavailable: ['android_bridge', 'application_replay_detail'],
      ...finishRequestSyncPerformance(outcome)
    }));
  }
}
