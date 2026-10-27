// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { openCompanionDailyFlow } from '../shared/platform/companion/runtime/companionDailyFlow';
import { commitCompanionFlowHistory, loadCompanionFlowHistory } from '../shared/platform/companion/runtime/companionFlowHistory';
import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';

import { seedCompanionReviewHistory } from './companionFlowHistory.testSupport';
import { createCompanionFlowHistoryEntry } from './companionFlowHistoryEntry';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true }, registerPlugin: createCompanionNativeSyncStub };
});

const now = '2026-10-25T08:00:00.000Z';
const key = 'flow_history:soon-intent';
let library: Awaited<ReturnType<typeof createSearchLibrary>>;
beforeEach(async () => {
  library = await createSearchLibrary(0);
  await seedCompanionReviewHistory({ due: now, lastReviewAt: null, state: 0, stability: 0,
    difficulty: 0, elapsedDays: 0, scheduledDays: 0, reps: 0, lapses: 0 }, now, ['a', 'b']);
  library.database.exec("UPDATE nodes SET kind='topic', reveal=NULL");
});
afterEach(async () => { await library.close(); });

async function entry() {
  const session = (await openCompanionDailyFlow({ now, mode: 'reading-only' })).session;
  const before = (await loadCompanionWorkspaceSyncState()).workspace_snapshot!;
  return createCompanionFlowHistoryEntry({ action: 'soon', nodeId: session.currentNodeId!, now,
    before, after: before, history: { key, mode: 'reading-only', session } });
}

it('keeps mobile Soon unplanned until its shared transaction returns the authoritative cursor and history', async () => {
  const draft = await entry();
  const source = draft.beforeContext.reviewSession;
  expect(draft.afterContext.reviewSession).toEqual(source);
  const result = await commitCompanionFlowHistory({ key, mode: 'reading-only', entry: draft });
  if (typeof result !== 'object' || !('session' in result)) throw new Error('missing_daily_session');
  expect(result.session.currentNodeId).toBe(source.queueNodeIds[1]);
  expect(result.session.soonNodeIds).toEqual([source.currentNodeId]);
  expect(library.database.prepare('SELECT * FROM node_reading').all()).toEqual([]);
  expect((await loadCompanionFlowHistory(key)).undoStack).toHaveLength(1);
});

it('rejects mobile Soon after the current topic changes to a review item without touching progress or history', async () => {
  const draft = await entry();
  library.database.prepare("UPDATE nodes SET kind='item', reveal='Answer' WHERE id=?").run(draft.nodeId);
  const before = library.database.prepare('SELECT * FROM daily_flow_state').get();
  await expect(commitCompanionFlowHistory({ key, mode: 'reading-only', entry: draft })).rejects.toThrow('daily_flow_learning_changed');
  expect(library.database.prepare('SELECT * FROM daily_flow_state').get()).toEqual(before);
  expect(library.database.prepare('SELECT * FROM daily_flow_operations').all()).toEqual([]);
  expect(library.database.prepare('SELECT * FROM node_reading').all()).toEqual([]);
  expect((await loadCompanionFlowHistory(key)).undoStack).toEqual([]);
});
