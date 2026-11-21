// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { refreshCompanionWorkspaceAfterMutation } from '../shared/platform/companion/companionWorkspaceRepository';
import { readCompanionContentSource, saveCompanionContentEdit } from '../shared/platform/companion/editing/companionContentEditing';
import { createSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { moveCompanionBatch } from '../shared/platform/companion/runtime/companionWorkspaceBatchMove';
import { mutateCompanionWorkspace } from '../shared/platform/companion/runtime/companionWorkspaceMutations';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true, isPluginAvailable: () => false }, registerPlugin: createCompanionNativeSyncStub };
});

const now = '2026-11-21T00:00:00.000Z';
let library: Awaited<ReturnType<typeof createSearchLibrary>>;

async function topic(id: string, parentNodeId: string) {
  await mutateCompanionWorkspace({ type: 'create', nodeId: id, kind: 'topic', parentNodeId, title: id });
  // Only topics with text take part in Sequential Reading.
  const source = await readCompanionContentSource(id);
  await saveCompanionContentEdit({ nodeId: id, baseVersionId: source.versionId, versionId: `text-${id}`, content: 'text', updatedAt: now });
}

beforeEach(async () => {
  library = await createSearchLibrary(20, 16);
  // The moved topic sits earlier in the library than the book, but it is newer than the book's topics,
  // so once moved it is shown after them.
  await mutateCompanionWorkspace({ type: 'create', nodeId: 'inbox', kind: 'folder', parentNodeId: null, title: 'Inbox' });
  await mutateCompanionWorkspace({ type: 'create', nodeId: 'shelf', kind: 'folder', parentNodeId: null, title: 'Shelf' });
  await topic('book', 'shelf');
  await topic('first', 'book');
  await topic('second', 'book');
  await topic('moved', 'inbox');
  const db = library.database;
  db.prepare("UPDATE nodes SET sequential_reading_enabled = 1 WHERE id = 'book'").run();
  const insert = db.prepare(`INSERT INTO node_reading (node_id, last_handled_at, next_at, state) VALUES (?, ?, ?, ?)`);
  insert.run('first', now, now, 'active');
  insert.run('second', now, now, 'locked');
  const snapshot = await refreshCompanionWorkspaceAfterMutation();
  expect(snapshot!.nodeOrder.indexOf('moved')).toBeLessThan(snapshot!.nodeOrder.indexOf('first'));
});
afterEach(async () => { await library.close(); });

const states = () => Object.fromEntries((library.database.prepare(
  "SELECT node_id, state FROM node_reading WHERE node_id IN ('moved', 'first', 'second') ORDER BY node_id").all() as
  { node_id: string; state: string }[]).map(row => [row.node_id, row.state]));

it('keeps the topic being read when a topic moves into its source', async () => {
  await mutateCompanionWorkspace({ type: 'move', nodeId: 'moved', parentNodeId: 'book' });
  expect(states()).toEqual({ first: 'active', moved: 'locked', second: 'locked' });
  const snapshot = await refreshCompanionWorkspaceAfterMutation();
  expect(snapshot!.nodeOrder.filter(id => ['first', 'second', 'moved'].includes(id))).toEqual(['first', 'second', 'moved']);
});

it('keeps the topic being read when a selection moves into its source', async () => {
  const snapshot = await refreshCompanionWorkspaceAfterMutation();
  await moveCompanionBatch([{ id: 'moved', version: snapshot!.nodesById.moved!.currentVersionId! }], 'book');
  expect(states()).toEqual({ first: 'active', moved: 'locked', second: 'locked' });
});
