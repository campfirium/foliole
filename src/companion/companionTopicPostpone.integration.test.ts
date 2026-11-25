// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { loadCompanionFlowHistory, replayCompanionFlowHistory } from '../shared/platform/companion/runtime/companionFlowHistory';
import { companionFlowHistoryKey } from '../shared/platform/companion/runtime/companionFlowHistoryStore';
import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { postponeCompanionTopic } from '../shared/platform/companion/runtime/companionTopicPostpone';
import { mutateCompanionWorkspace } from '../shared/platform/companion/runtime/companionWorkspaceMutations';
import { saveCompanionSyncNodeReadingRecord } from '../shared/platform/companionSyncObjects';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';
import { createEmptyReviewSession } from '../store/workspaceReviewReading';

import { resolveCompanionHistoryActionKey } from './companionHistoryActionLabel';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, isPluginAvailable: () => false }, registerPlugin: createCompanionNativeSyncStub };
});

let library: Awaited<ReturnType<typeof createSearchLibrary>>;
const now = '2026-10-25T08:00:00.000Z';
const DAY = 24 * 60 * 60 * 1000;
const key = companionFlowHistoryKey('Search');
const snapshot = async () => (await loadCompanionWorkspaceSyncState()).workspace_snapshot!;
const replay = (mode: 'undo' | 'redo') => replayCompanionFlowHistory(key, mode, createEmptyReviewSession());
const reading = { state: 'active' as const, intervalDurationMs: DAY, intervalGrowthFactor: 2,
  lastHandledAt: now, nextAt: new Date(Date.parse(now) + DAY).toISOString(), priority: 5, readingPosition: 3, repetitionCount: 2 };

beforeEach(async () => {
  library = await createSearchLibrary(0);
  await mutateCompanionWorkspace({ type: 'create', nodeId: 'folder', kind: 'folder', parentNodeId: null, title: 'Folder' });
  await mutateCompanionWorkspace({ type: 'create', nodeId: 'topic', kind: 'topic', parentNodeId: 'folder', title: 'Topic' });
});
afterEach(async () => { await library.close(); });

it('postpones a read topic by weeks and undoes and redoes only its reading', async () => {
  await saveCompanionSyncNodeReadingRecord({ nodeId: 'topic', reading });
  await postponeCompanionTopic({ nodeId: 'topic', level: 2, unit: 'weeks', now });
  const postponed = (await snapshot()).nodesById.topic?.reading;
  expect(postponed).toEqual({ ...reading, nextAt: new Date(Date.parse(now) + 14 * DAY).toISOString() });
  const history = await loadCompanionFlowHistory(key);
  expect(resolveCompanionHistoryActionKey(history.undoStack.at(-1) ?? null)).toBe('companion.history.action.postpone');
  await replay('undo');
  expect((await snapshot()).nodesById.topic?.reading).toEqual(reading);
  await replay('redo');
  expect((await snapshot()).nodesById.topic?.reading).toEqual(postponed);
  expect((await snapshot()).nodesById.topic?.title).toBe('Topic');
});

it('enters a topic never read into reading when postponed by days, and undo clears it again', async () => {
  await postponeCompanionTopic({ nodeId: 'topic', level: 5, unit: 'days', now });
  expect((await snapshot()).nodesById.topic?.reading).toMatchObject({
    state: 'active', nextAt: new Date(Date.parse(now) + 5 * DAY).toISOString(), repetitionCount: 0 });
  await replay('undo');
  expect((await snapshot()).nodesById.topic?.reading ?? null).toBeNull();
});

it('refuses a topic in Trash or one dismissed from reading', async () => {
  await saveCompanionSyncNodeReadingRecord({ nodeId: 'topic', reading: { ...reading, state: 'dismissed' } });
  await expect(postponeCompanionTopic({ nodeId: 'topic', level: 1, unit: 'weeks', now })).rejects.toThrow('topic_postpone_unavailable');
  await mutateCompanionWorkspace({ type: 'delete', nodeId: 'folder' });
  await expect(postponeCompanionTopic({ nodeId: 'topic', level: 1, unit: 'weeks', now })).rejects.toThrow('topic_postpone_unavailable');
});
