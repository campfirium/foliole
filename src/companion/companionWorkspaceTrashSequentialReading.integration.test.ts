// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { refreshCompanionWorkspaceAfterMutation } from '../shared/platform/companion/companionWorkspaceRepository';
import { readCompanionContentSource, saveCompanionContentEdit } from '../shared/platform/companion/editing/companionContentEditing';
import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { restoreCompanionBatchFromTrash } from '../shared/platform/companion/runtime/companionWorkspaceBatchRestore';
import { moveCompanionBatchToTrash } from '../shared/platform/companion/runtime/companionWorkspaceBatchTrash';
import { mutateCompanionWorkspace } from '../shared/platform/companion/runtime/companionWorkspaceMutations';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, isPluginAvailable: () => false }, registerPlugin: createCompanionNativeSyncStub };
});

let library: Awaited<ReturnType<typeof createSearchLibrary>>;
beforeEach(async () => {
  library = await createSearchLibrary(20, 16);
  await mutateCompanionWorkspace({ type: 'create', nodeId: 'source', kind: 'folder', parentNodeId: null, title: 'Source' });
  for (const id of ['a', 'b', 'c']) {
    await mutateCompanionWorkspace({ type: 'create', nodeId: id, kind: 'topic', parentNodeId: 'source', title: id });
    // Only topics with text take part in Sequential Reading.
    const source = await readCompanionContentSource(id);
    await saveCompanionContentEdit({ nodeId: id, baseVersionId: source.versionId, versionId: `text-${id}`,
      content: 'text', updatedAt: '2026-11-21T00:00:00.000Z' });
  }
  const db = library.database;
  db.prepare("UPDATE nodes SET sequential_reading_enabled = 1, manual_child_order = '[\"a\",\"b\",\"c\"]' WHERE id = 'source'").run();
  const insert = db.prepare(`INSERT INTO node_reading (node_id, last_handled_at, next_at, state)
    VALUES (?, '2026-11-21T00:00:00.000Z', '2026-11-21T00:00:00.000Z', ?)`);
  insert.run('a', 'active');
  insert.run('b', 'locked');
  insert.run('c', 'locked');
  await refreshCompanionWorkspaceAfterMutation();
});
afterEach(async () => { await library.close(); });

const states = () => Object.fromEntries((library.database.prepare(
  "SELECT node_id, state FROM node_reading WHERE node_id IN ('a', 'b', 'c') ORDER BY node_id").all() as
  { node_id: string; state: string }[]).map(row => [row.node_id, row.state]));

async function version(id: string) {
  return (await refreshCompanionWorkspaceAfterMutation())!.nodesById[id]!.currentVersionId!;
}

it('releases the next topic when the active topic moves to Trash', async () => {
  await mutateCompanionWorkspace({ type: 'delete', nodeId: 'a' });
  expect(states()).toEqual({ a: 'active', b: 'active', c: 'locked' });
  const snapshot = await refreshCompanionWorkspaceAfterMutation();
  expect(snapshot?.nodesById.b?.reading?.state).toBe('active');
});

it('releases the next topic when a selection with the active topic moves to Trash', async () => {
  await moveCompanionBatchToTrash([{ id: 'a', version: await version('a') }]);
  expect(states()).toEqual({ a: 'active', b: 'active', c: 'locked' });
  const snapshot = await refreshCompanionWorkspaceAfterMutation();
  expect(snapshot?.nodesById.b?.reading?.state).toBe('active');
});

it('gives the slot back when the selection is restored', async () => {
  await moveCompanionBatchToTrash([{ id: 'a', version: await version('a') }]);
  await restoreCompanionBatchFromTrash([{ id: 'a', version: await version('a') }]);
  expect(states()).toEqual({ a: 'active', b: 'locked', c: 'locked' });
  const snapshot = await refreshCompanionWorkspaceAfterMutation();
  expect(snapshot?.nodesById.b?.reading?.state).toBe('locked');
});

it('gives the slot back when the single topic is restored', async () => {
  await mutateCompanionWorkspace({ type: 'delete', nodeId: 'a' });
  await mutateCompanionWorkspace({ type: 'restore', nodeId: 'a' });
  expect(states()).toEqual({ a: 'active', b: 'locked', c: 'locked' });
});
