// @vitest-environment node
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { openCompanionDailyFlow } from '../shared/platform/companion/runtime/companionDailyFlow';
import { commitCompanionFlowHistory } from '../shared/platform/companion/runtime/companionFlowHistory';
import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { closeIosCompanionDatabase, initializeIosCompanionDatabase } from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';
import { createFakeCapacitorDatabaseManager } from '../shared/platform/companionSyncNodeVersionsTestSupport';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';

import { seedCompanionReviewHistory } from './companionFlowHistory.testSupport';
import { createCompanionFlowHistoryEntry } from './companionFlowHistoryEntry';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true }, registerPlugin: createCompanionNativeSyncStub };
});

const now = '2026-10-25T08:00:00.000Z';
const due = '2026-10-25T08:10:00.000Z';
let library: Awaited<ReturnType<typeof createSearchLibrary>>;
beforeEach(async () => { library = await createSearchLibrary(0); });
afterEach(async () => { await library.close(); });

it('admits a due review on native mobile reentry while keeping the current and pending Soon across reopening', async () => {
  await seedCompanionReviewHistory({ due, lastReviewAt: now, state: 1, stability: 0.1, difficulty: 4,
    elapsedDays: 0, scheduledDays: 0, reps: 1, lapses: 0 }, now);
  library.database.exec("UPDATE nodes SET kind='topic', reveal=NULL WHERE id IN ('a','b')");
  library.database.prepare("UPDATE node_review SET due=?, scheduled_days=0 WHERE node_id='c'").run(due);
  let session = (await openCompanionDailyFlow({ now, mode: 'reading-only' })).session;
  const [first, second] = session.queueNodeIds;
  for (let i = 0; i < 2; i += 1) {
    const snapshot = (await loadCompanionWorkspaceSyncState()).workspace_snapshot!;
    const result = await commitCompanionFlowHistory({ key: 'flow_history:reentry', mode: 'reading-only',
      entry: createCompanionFlowHistoryEntry({ action: 'soon', nodeId: session.currentNodeId!, now,
        before: snapshot, after: snapshot, history: { key: 'flow_history:reentry', mode: 'reading-only', session } }) });
    if (typeof result !== 'object' || !('session' in result)) throw new Error('missing_daily_session');
    session = result.session;
  }
  session = (await openCompanionDailyFlow({ now, mode: 'recommended' })).session;
  expect(session.currentNodeId).toBe(first);
  session = (await openCompanionDailyFlow({ now: '2026-10-25T08:09:59.999Z', mode: 'recommended' })).session;
  expect(session.queueNodeIds).toEqual([first, second]);
  expect(session.cycle?.clearedAt).toBeTruthy();
  session = (await openCompanionDailyFlow({ now: due, mode: 'recommended' })).session;
  expect(session.currentNodeId).toBe(first);
  expect(session.queueNodeIds[0]).toBe(first);
  expect(session.queueNodeIds.length).toBeLessThanOrEqual(2);
  expect(session.cycle?.clearedAt).toBeTruthy();
  expect(session.readTopicCount).toBe(2);
  await closeIosCompanionDatabase();
  const database = new Database(path.join(library.root, 'library.db'));
  await initializeIosCompanionDatabase({ booted_at: due, database_path: null, database_ready: false,
    host_name: 'Search', runtime_kind: 'android-capacitor' }, createFakeCapacitorDatabaseManager(database, true, () => {}));
  expect((await openCompanionDailyFlow({ now: due, mode: 'recommended' })).session).toEqual(session);
});
