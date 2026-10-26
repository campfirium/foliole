// @vitest-environment node
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { toWorkspaceNativeNodeVersion } from '../../lib/core/database/workspaceNodeSyncVersion';
import { restoreFlowHistorySession } from '../../lib/core/flow/flowHistorySession';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor';
import { invalidateCompanionReadingScope } from '../shared/platform/companion/reading/companionReadingScope';
import { loadCompanionFlowHistory, replayCompanionFlowHistory } from '../shared/platform/companion/runtime/companionFlowHistory';
import { companionFlowHistoryKey } from '../shared/platform/companion/runtime/companionFlowHistoryStore';
import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { mutateCompanionWorkspace } from '../shared/platform/companion/runtime/companionWorkspaceMutations';
import { writeIosCompanionDatabase } from '../shared/platform/companion/runtime/iosCompanionActiveDatabase';
import { closeIosCompanionDatabase, initializeIosCompanionDatabase } from '../shared/platform/companion/runtime/iosCompanionDatabaseBootstrap';
import { createFakeCapacitorDatabaseManager } from '../shared/platform/companionSyncNodeVersionsTestSupport';
import { runCompanionSyncWriterTask } from '../shared/platform/companionSyncWriterQueue';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';
import { createEmptyReviewSession } from '../store/workspaceReviewReading';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true }, registerPlugin: createCompanionNativeSyncStub };
});
let library: Awaited<ReturnType<typeof createSearchLibrary>>;
const now = '2026-10-25T08:00:00.000Z';
const key = companionFlowHistoryKey('Search');
const snapshot = async () => (await loadCompanionWorkspaceSyncState()).workspace_snapshot!;
const replay = (mode: 'undo' | 'redo') => replayCompanionFlowHistory(key, mode, createEmptyReviewSession());
beforeEach(async () => {
  library = await createSearchLibrary(0);
  await mutateCompanionWorkspace({ type: 'create', nodeId: 'folder', kind: 'folder', parentNodeId: null, title: 'Folder' });
});
afterEach(async () => { await library.close(); });

it('retains structural history and redo after closing and reopening the database', async () => {
  await mutateCompanionWorkspace({ type: 'rename', nodeId: 'folder', title: 'Renamed' });
  await replay('undo');
  const history = await loadCompanionFlowHistory(key);
  await closeIosCompanionDatabase();
  const reopened = new Database(path.join(library.root, 'library.db'));
  await initializeIosCompanionDatabase({ booted_at: now, database_path: null, database_ready: false,
    host_name: 'Search', runtime_kind: 'android-capacitor' }, createFakeCapacitorDatabaseManager(reopened, true, () => {}));
  expect(await loadCompanionFlowHistory(key)).toEqual(history);
  expect((await snapshot()).nodesById.folder?.title).toBe('Folder');
  await replay('redo');
  expect((await snapshot()).nodesById.folder?.title).toBe('Renamed');
});

it('rolls back an undo if its cursor cannot be saved', async () => {
  await mutateCompanionWorkspace({ type: 'rename', nodeId: 'folder', title: 'Renamed' });
  library.database.exec(`CREATE TRIGGER reject_history BEFORE INSERT ON companion_meta
    WHEN NEW.key LIKE 'flow_history:%' BEGIN SELECT RAISE(ABORT, 'history failed'); END;`);
  await expect(replay('undo')).rejects.toThrow('history failed');
  expect((await snapshot()).nodesById.folder?.title).toBe('Renamed');
  expect((await loadCompanionFlowHistory(key)).redoStack).toHaveLength(0);
});

it('does not execute a queued mutation in another library lifetime', async () => {
  let release = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  const blocker = runCompanionSyncWriterTask(() => gate);
  const pending = mutateCompanionWorkspace({ type: 'rename', nodeId: 'folder', title: 'Wrong lifetime' });
  const rejected = expect(pending).rejects.toThrow('flow_history_context_changed');
  invalidateCompanionReadingScope();
  release();
  await blocker;
  await rejected;
  expect((await snapshot()).nodesById.folder?.title).toBe('Folder');
});

it('restores the current Flow card together with a deleted card', async () => {
  const records = await Promise.all(['a', 'b'].map(id => toWorkspaceNativeNodeVersion({
    id, kind: 'item', parentNodeId: 'folder', title: id, content: 'Question', reveal: 'Answer', anchorLink: null,
    reading: null, review: null, isTitleManual: true, hideTitleHeading: false, createdAt: now, updatedAt: now
  }, 'remote')));
  await writeIosCompanionDatabase(db => applySyncNodesWithDbPort(db, records, { enqueueSearchInvalidations: false }));
  const session = { ...createEmptyReviewSession(), currentNodeId: 'a', queueNodeIds: ['a', 'b'], totalNodeCount: 2 };
  await mutateCompanionWorkspace({ type: 'delete', nodeId: 'a' }, { session, mode: 'review-first' });
  const entry = (await loadCompanionFlowHistory(key)).undoStack.at(-1)!;
  if (entry.type !== 'nodes.change') throw new Error('Missing structural history');
  expect(entry.afterSession?.currentNodeId).toBe('b');
  const restored = await replayCompanionFlowHistory(key, 'undo', restoreFlowHistorySession(entry.afterSession!, session));
  expect(restored?.currentNodeId).toBe('a');
  expect((await snapshot()).trashedNodeIds).not.toContain('a');
  expect((await replayCompanionFlowHistory(key, 'redo', restored!))?.currentNodeId).toBe('b');
});

it('refuses metadata edits without a synced base instead of replacing an unloaded body', async () => {
  library.database.prepare("INSERT INTO nodes (id,title,content,parent_id,kind,created_at,updated_at) VALUES ('legacy','Original','Keep the full body','folder','topic',?,?)").run(now, now);
  await expect(mutateCompanionWorkspace({ type: 'rename', nodeId: 'legacy', title: 'Changed' })).rejects.toThrow('workspace_base_unavailable');
  expect(library.database.prepare("SELECT content,title FROM nodes WHERE id='legacy'").get()).toEqual({ content: 'Keep the full body', title: 'Original' });
});
