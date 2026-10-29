// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { toWorkspaceNativeNodeVersion } from '../../lib/core/database/workspaceNodeSyncVersion';
import { restoreFlowHistorySession } from '../../lib/core/flow/flowHistorySession';
import { saveLocalCurrentParentOrderWithDbPort } from '../../lib/core/sync/currentParentOrderStore';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor';
import { openCompanionDailyFlow } from '../shared/platform/companion/runtime/companionDailyFlow';
import { loadCompanionFlowHistory, replayCompanionFlowHistory } from '../shared/platform/companion/runtime/companionFlowHistory';
import { companionFlowHistoryKey } from '../shared/platform/companion/runtime/companionFlowHistoryStore';
import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { mutateCompanionWorkspace } from '../shared/platform/companion/runtime/companionWorkspaceMutations';
import { writeIosCompanionDatabase } from '../shared/platform/companion/runtime/iosCompanionActiveDatabase';
import { applyCompanionSyncNodeVersions } from '../shared/platform/companionSyncNodeVersions';
import { saveCompanionSyncNodeReadingRecord } from '../shared/platform/companionSyncObjects';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';
import { createEmptyReviewSession } from '../store/workspaceReviewReading';

import { persistCompanionCapturedText } from './companionCaptureTextActions';
import { persistFlowMutation } from './companionFlowMutation';
import { restoreCompanionTrashNode } from './companionTrashActions';

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
  await mutateCompanionWorkspace({ type: 'create', nodeId: 'destination', kind: 'folder', parentNodeId: null, title: 'Destination' });
});
afterEach(async () => { vi.useRealTimers(); await library.close(); });

it('reverses and replays create, rename, move, delete and restore in order without losing content', async () => {
  await mutateCompanionWorkspace({ type: 'create', nodeId: 'topic', kind: 'topic', parentNodeId: 'folder', title: 'Original' });
  await mutateCompanionWorkspace({ type: 'rename', nodeId: 'topic', title: 'Renamed' });
  await mutateCompanionWorkspace({ type: 'move', nodeId: 'topic', parentNodeId: 'destination' });
  await mutateCompanionWorkspace({ type: 'delete', nodeId: 'topic' });
  await mutateCompanionWorkspace({ type: 'restore', nodeId: 'topic' });
  expect((await snapshot()).nodesById.topic).toMatchObject({ title: 'Renamed', parentNodeId: 'destination' });
  await replay('undo');
  expect((await snapshot()).trashedNodeIds).toContain('topic');
  await replay('undo');
  expect((await snapshot()).trashedNodeIds).not.toContain('topic');
  await replay('undo');
  expect((await snapshot()).nodesById.topic?.parentNodeId).toBe('folder');
  await replay('undo');
  expect((await snapshot()).nodesById.topic?.title).toBe('Original');
  await replay('undo');
  expect((await snapshot()).trashedNodeIds).toContain('topic');
  for (let i = 0; i < 5; i++) await replay('redo');
  expect((await snapshot()).nodesById.topic).toMatchObject({ title: 'Renamed', parentNodeId: 'destination', content: '' });
});

it('restores deleted folders and every child as one action', async () => {
  await mutateCompanionWorkspace({ type: 'create', nodeId: 'topic', kind: 'topic', parentNodeId: 'folder', title: 'Topic' });
  await mutateCompanionWorkspace({ type: 'create', nodeId: 'item', kind: 'item', parentNodeId: 'topic', title: 'Item' });
  await mutateCompanionWorkspace({ type: 'delete', nodeId: 'folder' });
  expect((await snapshot()).trashedNodeIds).toEqual(expect.arrayContaining(['folder', 'topic', 'item']));
  await replay('undo');
  expect((await snapshot()).trashedNodeIds).toEqual([]);
  await replay('redo');
  await restoreCompanionTrashNode({ deviceId: 'Search', nodeId: 'folder', snapshot: await snapshot() });
  await replay('undo');
  expect((await snapshot()).trashedNodeIds).toEqual(expect.arrayContaining(['folder', 'topic', 'item']));
  await replay('redo');
  expect((await snapshot()).trashedNodeIds).toEqual([]);
});

it.each([false, true])('undoes collected text and records share redelivery only once (share=%s)', async share => {
  const args = { deviceId: 'Search', snapshot: await snapshot(), text: 'Keep this body',
    ...(share ? { nodeId: 'shared', versionId: 'shared-version' } : {}) };
  const result = await persistCompanionCapturedText(args);
  if (share) await persistCompanionCapturedText(args);
  await replay('undo');
  expect((await snapshot()).trashedNodeIds).toContain(result.nodeId);
  expect((await snapshot()).trashedNodeIds).not.toContain('destination');
  await replay('redo');
  expect(library.database.prepare('SELECT content, deleted_at FROM nodes WHERE id = ?').get(result.nodeId)).toEqual({ content: 'Keep this body', deleted_at: null });
  expect((await loadCompanionFlowHistory(key)).undoStack).toHaveLength(3);
});

it('clears redo after another workspace action and persists the same cursor to SQLite', async () => {
  await mutateCompanionWorkspace({ type: 'rename', nodeId: 'folder', title: 'Second' });
  await replay('undo');
  expect((await loadCompanionFlowHistory(key)).redoStack).toHaveLength(1);
  await mutateCompanionWorkspace({ type: 'rename', nodeId: 'folder', title: 'Replacement' });
  expect((await loadCompanionFlowHistory(key)).redoStack).toHaveLength(0);
  const row = library.database.prepare('SELECT value FROM companion_meta WHERE key = ?').get(key) as { value: string };
  expect(JSON.parse(row.value).undoStack.at(-1).changes[0].after.title).toBe('Replacement');
});

it('does not overwrite newer metadata', async () => {
  await mutateCompanionWorkspace({ type: 'rename', nodeId: 'folder', title: 'Second' });
  library.database.prepare('UPDATE nodes SET title = ? WHERE id = ?').run('External title', 'folder');
  await expect(replay('undo')).rejects.toThrow('workspace_history_changed');
  expect((await snapshot()).nodesById.folder?.title).toBe('External title');
  expect((await loadCompanionFlowHistory(key)).undoStack).toHaveLength(3);
});

it('rolls back data and history together when the history write fails', async () => {
  library.database.exec(`CREATE TRIGGER reject_history BEFORE INSERT ON companion_meta
    WHEN NEW.key LIKE 'flow_history:%' BEGIN SELECT RAISE(ABORT, 'history failed'); END;`);
  await expect(mutateCompanionWorkspace({ type: 'rename', nodeId: 'folder', title: 'Lost' })).rejects.toThrow('history failed');
  expect((await snapshot()).nodesById.folder?.title).toBe('Folder');
  expect((await loadCompanionFlowHistory(key)).undoStack).toHaveLength(2);
});

it('rejects moves into descendants, items or unavailable parents', async () => {
  await mutateCompanionWorkspace({ type: 'create', nodeId: 'child', kind: 'folder', title: 'Child', parentNodeId: 'folder' });
  await expect(mutateCompanionWorkspace({ type: 'move', nodeId: 'folder', parentNodeId: 'child' })).rejects.toThrow('node_parent_cycle');
  await expect(mutateCompanionWorkspace({ type: 'move', nodeId: 'folder', parentNodeId: 'missing' })).rejects.toThrow('node_parent_unavailable');
  expect((await snapshot()).nodesById.folder?.parentNodeId).toBeNull();
});

it('preserves bodies, resource links and raw version metadata through rename and replay', async () => {
  const record = await toWorkspaceNativeNodeVersion({ id: 'rich', parentNodeId: 'folder', kind: 'topic', title: 'Rich',
    content: 'Body with attachments', reveal: null, anchorLink: null, reading: null, review: null,
    isTitleManual: true, hideTitleHeading: false, createdAt: now, updatedAt: now,
    attachments: [{ attachmentId: 'attachment', mimeType: 'image/png', originalName: 'pic.png', role: 'inline' }] }, 'remote', 'rich-base');
  await writeIosCompanionDatabase(db => applySyncNodesWithDbPort(db, [record], { enqueueSearchInvalidations: false }));
  await mutateCompanionWorkspace({ type: 'rename', nodeId: 'rich', title: 'Changed' });
  await replay('undo');
  await replay('redo');
  expect(library.database.prepare('SELECT title, content FROM nodes WHERE id = ?').get('rich')).toEqual({ title: 'Changed', content: 'Body with attachments' });
  const current = library.database.prepare('SELECT snapshot_json FROM node_sync_versions WHERE version_id = (SELECT current_version_id FROM nodes WHERE id = ?)').get('rich') as { snapshot_json: string };
  expect(JSON.parse(current.snapshot_json).attachments).toEqual([{ attachment_id: 'attachment', role: 'inline' }]);
});

it('places Flow operations and structural operations in the same chronological stack', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(now);
  const before = await snapshot();
  const node = before.nodesById.folder!;
  const record = await toWorkspaceNativeNodeVersion({ ...node, currentVersionId: null, id: 'reading', kind: 'topic', parentNodeId: 'folder', content: 'Read me', createdAt: now, updatedAt: now }, 'remote');
  await applyCompanionSyncNodeVersions([record]);
  const session = (await openCompanionDailyFlow({ now, mode: 'recommended', preferredNodeId: 'reading' })).session;
  await persistFlowMutation({ action: 'read', nodeId: 'reading', snapshot: await snapshot(), now,
    history: { key, mode: 'recommended', session } });
  await mutateCompanionWorkspace({ type: 'rename', nodeId: 'folder', title: 'After reading' });
  await replay('undo');
  const history = await loadCompanionFlowHistory(key);
  const entry = history.undoStack.at(-1)!;
  expect(entry.type).toBe('topic.dismiss');
  if (entry.type !== 'topic.dismiss') throw new Error('Missing Flow history');
  await replayCompanionFlowHistory(key, 'undo', restoreFlowHistorySession(entry.afterContext.reviewSession, session));
  expect((await snapshot()).nodesById.reading?.reading).toBeNull();
});

it('undoes nested creations after their children have been undone', async () => {
  await mutateCompanionWorkspace({ type: 'create', nodeId: 'nested', kind: 'folder', title: 'Nested', parentNodeId: 'folder' });
  await mutateCompanionWorkspace({ type: 'create', nodeId: 'topic', kind: 'topic', title: 'Topic', parentNodeId: 'nested' });
  await replay('undo');
  await replay('undo');
  expect((await snapshot()).trashedNodeIds).toEqual(expect.arrayContaining(['nested', 'topic']));
  await replay('redo');
  await replay('redo');
  expect((await snapshot()).trashedNodeIds).toEqual([]);
});

it('refuses to undo creation across an externally added child', async () => {
  library.database.prepare("INSERT INTO nodes (id,title,parent_id,kind,created_at,updated_at) VALUES ('external','External','destination','topic',?,?)").run(now, now);
  await expect(replay('undo')).rejects.toThrow('workspace_history_subtree_changed');
  expect((await snapshot()).trashedNodeIds).toEqual([]);
});

it('restores the original sibling placement when moving back', async () => {
  for (const id of ['a', 'b', 'c']) await mutateCompanionWorkspace({ type: 'create', nodeId: id, kind: 'topic', title: id, parentNodeId: 'folder' });
  await writeIosCompanionDatabase(db => saveLocalCurrentParentOrderWithDbPort(db, { parentId: 'folder', childIds: ['c', 'b', 'a'], hostName: 'Search', now }));
  const before = library.database.prepare('SELECT child_ids_json FROM parent_child_order WHERE parent_id = ?').get('folder');
  await mutateCompanionWorkspace({ type: 'move', nodeId: 'b', parentNodeId: 'destination' });
  await replay('undo');
  expect(library.database.prepare('SELECT child_ids_json FROM parent_child_order WHERE parent_id = ?').get('folder')).toEqual(before);
  await replay('redo');
  expect((await snapshot()).nodesById.b?.parentNodeId).toBe('destination');
});

it('moves a subtree out of sequential reading and replays its related reading states atomically', async () => {
  const base = (await snapshot()).nodesById.folder!;
  const definitions = [
    { ...base, id: 'source', kind: 'folder' as const, parentNodeId: null, sequentialReadingEnabled: true },
    { ...base, id: 'moved', kind: 'folder' as const, parentNodeId: 'source' },
    { ...base, id: 'locked', kind: 'topic' as const, parentNodeId: 'moved', content: 'Reading content' }
  ];
  const records = await Promise.all(definitions.map(node => toWorkspaceNativeNodeVersion({ ...node, currentVersionId: null }, 'remote')));
  await writeIosCompanionDatabase(db => applySyncNodesWithDbPort(db, records, { enqueueSearchInvalidations: false }));
  const reading = { state: 'locked' as const, intervalDurationMs: 1000, intervalGrowthFactor: 2,
    lastHandledAt: now, nextAt: now, priority: 5, readingPosition: 17, repetitionCount: 2 };
  await saveCompanionSyncNodeReadingRecord({ nodeId: 'locked', reading });
  await mutateCompanionWorkspace({ type: 'move', nodeId: 'moved', parentNodeId: 'destination' });
  expect((await snapshot()).nodesById.locked?.reading?.state).toBe('active');
  await replay('undo');
  expect((await snapshot()).nodesById.locked?.reading).toEqual(reading);
  await replay('redo');
  expect((await snapshot()).nodesById.locked?.reading).toMatchObject({ state: 'active', readingPosition: 17 });
  await saveCompanionSyncNodeReadingRecord({ nodeId: 'locked', reading: { ...reading, state: 'active', repetitionCount: 3 } });
  await expect(replay('undo')).rejects.toThrow('workspace_history_reading_changed');
  expect((await snapshot()).nodesById.moved?.parentNodeId).toBe('destination');
  expect((await snapshot()).nodesById.locked?.reading?.repetitionCount).toBe(3);
});

it('undoes and redoes shelving without changing the body', async () => {
  await mutateCompanionWorkspace({ type: 'create', nodeId: 'topic', kind: 'topic', title: 'Topic', parentNodeId: 'folder' });
  await mutateCompanionWorkspace({ type: 'shelve', nodeId: 'topic' });
  expect((await snapshot()).nodesById.topic?.shelvedAt).toBeTruthy();
  await replay('undo');
  expect((await snapshot()).nodesById.topic?.shelvedAt).toBeFalsy();
  await replay('redo');
  expect((await snapshot()).nodesById.topic?.shelvedAt).toBeTruthy();
  await mutateCompanionWorkspace({ type: 'unshelve', nodeId: 'topic' });
  await replay('undo');
  expect((await snapshot()).nodesById.topic?.shelvedAt).toBeTruthy();
});
