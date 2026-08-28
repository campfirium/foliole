import { loadCompanionSyncGroup } from '../shared/platform/companion/sync/syncGroupStore';
import { loadCompanionBootstrapState } from '../shared/platform/companionBootstrap';
import { syncCompanionObjectsFromDesktop } from '../shared/platform/companionDesktopSyncObjects';
import {
  saveCompanionSyncActiveViewState,
  saveCompanionSyncNodeReadingRecord,
  saveCompanionSyncNodeReviewRecord,
  saveCompanionSyncNodeViewState,
  saveCompanionSyncSettingRecord
} from '../shared/platform/companionSyncStateWriters';
import { saveCompanionWorkspaceSyncEndpoint } from '../shared/platform/companionWorkspaceSync';

import { ensureIosAcceptanceSyncGroup } from './iosAcceptanceSyncGroup';
import { postResult } from './iosBridgeAcceptance';

const NODE_ID = 'ios-state-node';
const REVIEWED_AT = '2026-07-21T00:01:00.000Z';

async function writeAcceptanceState() {
  await saveCompanionSyncActiveViewState(NODE_ID);
  await saveCompanionSyncNodeViewState({ nodeId: NODE_ID, scrollTop: 42 });
  await saveCompanionSyncNodeReadingRecord({
    nodeId: NODE_ID,
    reading: {
      intervalDurationMs: 60_000,
      intervalGrowthFactor: 1.5,
      lastHandledAt: REVIEWED_AT,
      nextAt: '2026-07-21T00:02:00.000Z',
      priority: 2,
      readingPosition: 42,
      repetitionCount: 3,
      state: 'active'
    }
  });
  await saveCompanionSyncNodeReviewRecord({
    nodeId: NODE_ID,
    review: {
      difficulty: 5.2,
      due: '2026-07-28T00:01:00.000Z',
      elapsedDays: 3,
      lapses: 1,
      lastReviewAt: REVIEWED_AT,
      reps: 4,
      scheduledDays: 7,
      stability: 8.5,
      state: 2
    },
    reviewLog: {
      cardAfter: { difficulty: 5.2, due: '2026-07-28T00:01:00.000Z', stability: 8.5 },
      cardBefore: { difficulty: 6.1, due: REVIEWED_AT, stability: 4.2 },
      grade: 3,
      reviewedAt: REVIEWED_AT,
      schedulerVersion: 'fsrs-6'
    }
  });
  await saveCompanionSyncSettingRecord({
    key: 'handoff_reminder_settings',
    valueJson: JSON.stringify({ enabled: true })
  });
}

async function syncWithoutResources(endpoint: string) {
  return await syncCompanionObjectsFromDesktop(endpoint, { includeResources: false });
}

export async function runIosStateWritebackAcceptance() {
  try {
    const bootstrap = await loadCompanionBootstrapState();
    const group = await loadCompanionSyncGroup();
    const endpoint = (await ensureIosAcceptanceSyncGroup(bootstrap.database_path)).endpointUrl;
    if (!group) {
      await saveCompanionWorkspaceSyncEndpoint(endpoint);
      await syncWithoutResources(endpoint);
      await writeAcceptanceState();
    }
    const sync = await syncWithoutResources(endpoint);
    postResult({
      error: null,
      phase: group ? 'reapplied' : 'applied',
      scenario: 'state-writeback-runtime',
      status: 'passed',
      sync
    });
  } catch (error) {
    postResult({
      error: error instanceof Error ? error.message : String(error),
      phase: 'failed',
      scenario: 'state-writeback-runtime',
      status: 'failed'
    });
  }
}
