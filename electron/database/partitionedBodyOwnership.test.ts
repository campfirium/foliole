// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { writeNodeBody } from '../../lib/core/database/nodeBodyMutation.js';
import { moveNodes } from '../../lib/core/database/nodeMoveMutations.js';
import { readMoveParentOrder } from '../../lib/core/database/nodeMoveStructure.js';
import { deleteNodesPermanently, restoreNodes, softDeleteNodes, upsertNodeSnapshot } from '../../lib/core/database/nodeMutations.js';
import { readBodyPartIds, readPartitionedNodeBody } from '../../lib/core/database/partitionedNodeBody.js';
import { createPreparedDesktopTextImport } from '../../lib/core/import/fingerprint.js';
import { TEXT_BODY_MAX_BYTES } from '../../lib/core/nodes/textBodyBudget.js';
import { recordCompletedSyncGroupRound } from '../../lib/core/sync/syncGroupCoverageStore.js';
import { collectSyncGroupHistory } from '../../lib/core/sync/syncHistoryCollection.js';

import { runPreparedImport } from './importPipeline.js';
import { openNodeSqliteFixture } from './nodeSqliteFixture.testSupport.js';
import { flushNodeSyncVersionWithDriver } from './nodeSyncVersionFromDriver.js';
import { partitionEditedBody } from './partitionEditedBody.js';

vi.mock('./connection.js', () => ({ openDatabaseConnection: () => connection }));
vi.mock('electron', () => ({}));

const NOW = '2026-10-08T00:00:00.000Z';
const BASE_TEXT = 'x'.repeat(TEXT_BODY_MAX_BYTES);
const LOCAL_EDIT = 'User-edited text in the moved topic.';
let connection: ReturnType<typeof openNodeSqliteFixture>;
beforeEach(() => { connection = openNodeSqliteFixture(); });
afterEach(() => connection.sqlite.close());

function importBody(content: string, importedAt = NOW, target?: string) {
  const input = createPreparedDesktopTextImport({
    content, degradedReason: null, fileName: 'sample.txt', filePath: '/safe-fixture/sample.txt',
    importedAt, kind: 'text'
  });
  const result = runPreparedImport(input, target ? { forceUpdateExistingNodeId: target } : undefined);
  if (!result.nodeId) throw new Error('fixture_import_missing');
  return result.nodeId;
}

function moveAndEditPart(root: string, part: string) {
  const { driver } = connection;
  const destination = 'destination';
  upsertNodeSnapshot(driver, { content: '', createdAt: NOW, kind: 'folder', nodeId: destination,
    title: 'Different folder', updatedAt: NOW, parentNodeId: null,
    isTitleManual: true, anchorLink: null, reveal: null, position: null });
  const from = readMoveParentOrder(driver, root).visibleIds;
  moveNodes(driver, {
    maintainSequentialReading: false, defaultPriority: 5,
    nodes: [{ nodeId: part, expectedParentNodeId: root, parentNodeId: destination, updatedAt: NOW }],
    parentOrders: [
      { parentNodeId: root, expectedChildIds: from, childIds: from.filter(id => id !== part) },
      { parentNodeId: destination, expectedChildIds: [], childIds: [part] }
    ]
  });
  writeNodeBody({ driver, nodeId: part, title: 'Moved topic', content: LOCAL_EDIT, updatedAt: NOW });
}

function expectMovedPartIntact(root: string, part: string, expectedBody: string) {
  const { driver } = connection;
  const moved = driver.queryOne<{ parent_id: string; content: string }>(
    'SELECT parent_id, content FROM nodes WHERE id = ?', [part]);
  expect(moved?.parent_id).toBe('destination');
  expect(moved?.content.length).toBe(LOCAL_EDIT.length);
  expect(moved?.content).toBe(LOCAL_EDIT);
  expect(readBodyPartIds(driver, root)).not.toContain(part);
  expect(readPartitionedNodeBody(driver, root)).toBe(expectedBody);
}

it('keeps a moved and edited topic when the original is split again', () => {
  const { driver } = connection;
  const root = importBody('initial');
  partitionEditedBody({ disposition: 'partition-body', sourceNodeId: root, expectedContent: 'initial',
    content: BASE_TEXT + 'first tail' });
  const [first, moved] = readBodyPartIds(driver, root) as [string, string];
  moveAndEditPart(root, moved);
  const candidate = 'new prefix' + BASE_TEXT;
  partitionEditedBody({ disposition: 'partition-body', sourceNodeId: root, expectedContent: '', content: candidate });
  expectMovedPartIntact(root, moved, candidate + BASE_TEXT);
  expect(readBodyPartIds(driver, root)[0]).toBe(first);
});

it('keeps a moved and edited topic when a source is reimported', () => {
  const { driver } = connection;
  const root = importBody(BASE_TEXT + 'first tail');
  const [first, moved] = readBodyPartIds(driver, root) as [string, string];
  moveAndEditPart(root, moved);
  const updated = BASE_TEXT + 'updated source tail';
  expect(importBody(updated, '2026-10-08T00:01:00.000Z', root)).toBe(root);
  expectMovedPartIntact(root, moved, updated);
  const replacements = readBodyPartIds(driver, root);
  expect(replacements).toHaveLength(2);
  expect(replacements[0]).toBe(first);
  expect(importBody(updated + '!', '2026-10-08T00:02:00.000Z', root)).toBe(root);
  expect(readBodyPartIds(driver, root)).toEqual(replacements);
  expectMovedPartIntact(root, moved, updated + '!');
});

it('reimports after Trash creates a gap while retaining the trashed topic and later part', () => {
  const { driver } = connection;
  const body = BASE_TEXT + 'y'.repeat(TEXT_BODY_MAX_BYTES) + 'third';
  const root = importBody(body);
  const [first, middle, last] = readBodyPartIds(driver, root) as [string, string, string];
  const deletedAt = '2026-10-08T00:01:00.000Z';
  softDeleteNodes(driver, { nodeIds: [middle], deletedAt });
  const updated = body + ' updated';
  expect(importBody(updated, '2026-10-08T00:02:00.000Z', root)).toBe(root);
  expect(driver.queryOne('SELECT deleted_at, content FROM nodes WHERE id = ?', [middle]))
    .toEqual({ deleted_at: deletedAt, content: 'y'.repeat(TEXT_BODY_MAX_BYTES) });
  const parts = readBodyPartIds(driver, root);
  expect(parts).toEqual([first, expect.any(String), last]);
  expect(parts).not.toContain(middle);
  expect(readMoveParentOrder(driver, root).visibleIds).toEqual(parts);
  expect(readPartitionedNodeBody(driver, root) === updated).toBe(true);

  expect(restoreNodes(driver, { nodeIds: [middle] }).restoredNodeIds).toEqual([middle]);
  writeNodeBody({ driver, nodeId: middle, title: 'Restored topic', content: LOCAL_EDIT, updatedAt: NOW });
  expect(importBody(updated + '!', '2026-10-08T00:03:00.000Z', root)).toBe(root);
  expect(readMoveParentOrder(driver, root).visibleIds).toContain(middle);
  expect(driver.queryOne('SELECT content FROM nodes WHERE id = ?', [middle])?.content).toBe(LOCAL_EDIT);
  expect(readBodyPartIds(driver, root)).toEqual(parts);
  expect(readPartitionedNodeBody(driver, root) === updated + '!').toBe(true);
});

async function settleSyncHistory() {
  const { port, sqlite } = connection;
  sqlite.exec(`INSERT INTO sync_groups VALUES ('group', 'Group', 'key', '${NOW}', '${NOW}');
    INSERT INTO sync_group_local_state VALUES (1, 'group', 'desktop', 'active', '${NOW}');
    INSERT INTO sync_group_devices (group_id, device_identity_key, device_anchor, canonical_library_path,
      device_name, platform, state, joined_at, updated_at)
    VALUES ('group', 'desktop', 'desktop-anchor', '/desktop', 'Desktop', 'mac', 'active', '${NOW}', '${NOW}'),
      ('group', 'phone', 'phone-anchor', '/phone', 'Phone', 'ios', 'active', '${NOW}', '${NOW}')`);
  await recordCompletedSyncGroupRound(port, { groupId: 'group', localDeviceId: 'desktop', peerDeviceId: 'phone',
    startedAt: '2026-10-20T00:00:00.000Z' });
}

it('keeps the restored original independent after deleting its replacement and settling sync history', async () => {
  const { driver, port } = connection;
  const root = importBody(BASE_TEXT + 'original');
  const original = readBodyPartIds(driver, root)[1]!;
  softDeleteNodes(driver, { nodeIds: [original], deletedAt: '2026-10-08T00:01:00.000Z' });
  importBody(BASE_TEXT + 'updated', '2026-10-08T00:02:00.000Z', root);
  const replacement = readBodyPartIds(driver, root)[1]!;
  expect(replacement).not.toBe(original);
  expect(restoreNodes(driver, { nodeIds: [original] }).restoredNodeIds).toEqual([original]);
  writeNodeBody({ driver, nodeId: original, title: 'Restored topic', content: LOCAL_EDIT, updatedAt: NOW });

  const deletedAt = '2026-10-08T00:03:00.000Z';
  softDeleteNodes(driver, { nodeIds: [replacement], deletedAt });
  expect(flushNodeSyncVersionWithDriver(driver, replacement, 'test-host', deletedAt)).toBeTruthy();
  deleteNodesPermanently(driver, { nodeIds: [replacement], deletedAt });
  await settleSyncHistory();
  await collectSyncGroupHistory(work => work(port), 'group');

  const updated = BASE_TEXT + 'latest source text';
  importBody(updated, '2026-10-21T00:00:00.000Z', root);
  expect(driver.queryOne('SELECT content FROM nodes WHERE id = ?', [original])?.content).toBe(LOCAL_EDIT);
  expect(readBodyPartIds(driver, root)).not.toContain(original);
  expect(readPartitionedNodeBody(driver, root) === updated).toBe(true);

  await collectSyncGroupHistory(work => work(port), 'group');
  expect(driver.queryOne('SELECT node_id FROM node_sync_tombstones WHERE node_id = ?', [replacement])).toBeUndefined();
});
