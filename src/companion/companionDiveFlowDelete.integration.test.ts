// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { toWorkspaceNativeNodeVersion } from '../../lib/core/database/workspaceNodeSyncVersion';
import { restoreFlowHistorySession } from '../../lib/core/flow/flowHistorySession';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor';
import { openCompanionDailyFlow } from '../shared/platform/companion/runtime/companionDailyFlow';
import { loadCompanionFlowHistory, replayCompanionFlowHistory } from '../shared/platform/companion/runtime/companionFlowHistory';
import { companionFlowHistoryKey } from '../shared/platform/companion/runtime/companionFlowHistoryStore';
import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { mutateCompanionWorkspace } from '../shared/platform/companion/runtime/companionWorkspaceMutations';
import { writeIosCompanionDatabase } from '../shared/platform/companion/runtime/iosCompanionActiveDatabase';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, isPluginAvailable: () => false }, registerPlugin: createCompanionNativeSyncStub };
});
let library: Awaited<ReturnType<typeof createSearchLibrary>>;
const now = '2026-10-25T08:00:00.000Z';
const key = companionFlowHistoryKey('Search');
const trashed = async () => (await loadCompanionWorkspaceSyncState()).workspace_snapshot!.trashedNodeIds;

beforeEach(async () => {
  library = await createSearchLibrary(0);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(now));
});
afterEach(async () => { await library.close(); vi.useRealTimers(); });

async function openDive() {
  await mutateCompanionWorkspace({ type: 'create', nodeId: 'folder', kind: 'folder', parentNodeId: null, title: 'Folder' });
  // Dive members live under a topic; the source topic itself is left out of the review-first turn.
  await mutateCompanionWorkspace({ type: 'create', nodeId: 'source', kind: 'topic', parentNodeId: 'folder', title: 'Source' });
  const records = await Promise.all(['a', 'b', 'outside'].map(id => toWorkspaceNativeNodeVersion({
    id, kind: 'item', parentNodeId: id === 'outside' ? null : 'source', title: id, content: 'Question', reveal: 'Answer',
    anchorLink: null, reading: null, review: null, isTitleManual: true, hideTitleHeading: false, createdAt: now, updatedAt: now
  }, 'remote')));
  await writeIosCompanionDatabase(db => applySyncNodesWithDbPort(db, records, { enqueueSearchInvalidations: false }), { kind: 'business' });
  await mutateCompanionWorkspace({ type: 'create-dive', nodeId: 'dive', title: 'Dive', sourceId: 'folder' });
  const { session } = await openCompanionDailyFlow({ now, mode: 'review-first', dive: { id: 'dive', topicIds: ['folder'] } });
  expect(['a', 'b']).toContain(session.currentNodeId);
  return { session, first: session.currentNodeId!, second: session.currentNodeId === 'a' ? 'b' : 'a' };
}

it('stays in the Dive when its current card is deleted, undone and redone', async () => {
  const { session, first, second } = await openDive();
  await mutateCompanionWorkspace({ type: 'delete', nodeId: first }, { session, mode: 'review-first' });
  const entry = (await loadCompanionFlowHistory(key)).undoStack.at(-1)!;
  if (entry.type !== 'nodes.change') throw new Error('Missing structural history');
  expect(entry.afterSession).toMatchObject({ dive: { id: 'dive' }, currentNodeId: second });

  const source = restoreFlowHistorySession(entry.afterSession!, session);
  const restored = await replayCompanionFlowHistory(key, 'undo', source, 'undo-delete');
  expect(restored).toMatchObject({ dive: { id: 'dive' }, currentNodeId: first });
  expect(await replayCompanionFlowHistory(key, 'undo', source, 'undo-delete')).toMatchObject({ dive: { id: 'dive' }, currentNodeId: first });
  expect(await trashed()).not.toContain(first);

  const redone = await replayCompanionFlowHistory(key, 'redo', restored!);
  expect(redone).toMatchObject({ dive: { id: 'dive' }, currentNodeId: second });
  expect(await trashed()).toContain(first);
});
