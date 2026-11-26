// @vitest-environment node

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '';
vi.mock('../../../electron/ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));
vi.mock('../../../electron/foliolePublish/foliolePublishManagement.js', () => ({ assertFoliolePublishedDeleteAllowed: vi.fn() }));

import { closeDatabaseConnection, openDatabaseConnection } from '../../../electron/database/connection.js';
import { initializeDatabase } from '../../../electron/database/migrate.js';
import { softDeleteNodes, upsertNodeSnapshot } from '../../../electron/database/nodeMutations.js';
import { partitionEditedBody } from '../../../electron/database/partitionEditedBody.js';
import { splitTopic } from '../../../electron/database/splitTopicMutation.js';
import { loadSplitTopicPreview } from '../../../electron/database/splitTopicPreview.js';
import { loadWorkspaceListSnapshot } from '../../../electron/database/workspaceListSnapshot.js';
import { writeNodeBody } from '../../../lib/core/database/nodeBodyMutation.js';
import { loadDerivedNodeOrder } from '../../../lib/core/database/parentChildOrder.js';
import { buildSplitTopicNodeOrder, buildSplitTopicParts } from '../../../lib/core/nodes/splitTopicModel.js';
import { TEXT_BODY_MAX_BYTES } from '../../../lib/core/nodes/textBodyBudget.js';
import type { WorkspaceNodeMutationPatchResult } from '../../shared/platform/workspaceRuntimeTypes';
import { canPlaceChildOrders } from '../../store/workspaceChildOrderPlacement';
import { createWorkspaceNodeMutationPatch } from '../../store/workspaceNodeMutationPatch';
import type { WorkspaceState } from '../../store/workspaceStoreTypes';

let tempRoot = '';
beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-split-child-orders-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  await initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

const CREATED = '2026-01-01T00:00:00.000Z';

function seed(nodeId: string, parentNodeId: string | null, position: number, content = nodeId,
  anchorLink: Parameters<typeof upsertNodeSnapshot>[0]['anchorLink'] = null) {
  upsertNodeSnapshot({
    anchorLink, content, createdAt: CREATED, isTitleManual: true, kind: 'topic', nodeId, parentNodeId,
    position, reveal: null, title: nodeId, updatedAt: CREATED
  });
}

function highlight(id: string, from: number, originalText: string) {
  return { id, kind: 'highlight' as const, locator: { from, originalText, to: from + originalText.length } };
}

function seedUnrelated(count: number) {
  for (let index = 0; index < count; index += 1) {
    seed(`unrelated-${index}`, null, index);
    seed(`unrelated-${index}-child`, `unrelated-${index}`, 0);
  }
}

function openedWorkspace() {
  const snapshot = loadWorkspaceListSnapshot();
  return {
    nodeOrder: snapshot.nodeOrder,
    nodesById: snapshot.nodesById as unknown as WorkspaceState['nodesById']
  };
}

/** Stored nodes that are neither in Trash nor under it, in the order the given list shows them. */
function visible(order: readonly string[]) {
  const rows = new Map(openDatabaseConnection().driver.queryAll<{ id: string; parent_id: string | null; deleted_at: string | null }>(
    'SELECT id, parent_id, deleted_at FROM nodes').map((row) => [row.id, row]));
  const isVisible = (id: string): boolean => {
    const row = rows.get(id);
    return Boolean(row && !row.deleted_at && (row.parent_id === null || isVisible(row.parent_id)));
  };
  return order.filter(isVisible);
}

/** The previous reply was the same nodes with the library-wide order. */
function expectSameVisibleOrder(before: ReturnType<typeof openedWorkspace>, patch: WorkspaceNodeMutationPatchResult) {
  expect(patch.nodeOrder).toBeUndefined();
  expect(canPlaceChildOrders(before.nodesById, patch)).toBe(true);
  const nodesOnly: WorkspaceNodeMutationPatchResult = { ...patch };
  delete nodesOnly.childOrders;
  const full = createWorkspaceNodeMutationPatch(before, { ...nodesOnly, nodeOrder: loadDerivedNodeOrder(openDatabaseConnection().driver) });
  const partial = createWorkspaceNodeMutationPatch(before, patch);
  expect(visible(partial.nodeOrder!)).toEqual(visible(full.nodeOrder!));
}

function patchIds(patch: WorkspaceNodeMutationPatchResult) {
  return [...patch.nodes.map((node) => node.nodeId), ...(patch.childOrders ?? []).flatMap((order) => order.childIds)];
}

function partitionScenario(unrelated: number) {
  seedUnrelated(unrelated);
  seed('folder', null, 100);
  seed('source', 'folder', 0, 'original Alpha');
  seed('after', 'folder', 1);
  seed('note', 'source', 0, 'Alpha', highlight('a', 9, 'Alpha'));
  seed('plain', 'source', 1);
  seed('plain-child', 'plain', 0);
  seed('trashed', 'source', 2);
  softDeleteNodes({ deletedAt: '2026-01-02T00:00:00.000Z', nodeIds: ['trashed'] });
  const before = openedWorkspace();
  const patch = partitionEditedBody({ disposition: 'partition-body', sourceNodeId: 'source',
    expectedContent: 'original Alpha', content: 'original Alpha ' + 'x'.repeat(TEXT_BODY_MAX_BYTES) });
  return { before, patch };
}

it('places body parts in the same visible order as the library-wide order', () => {
  const { before, patch } = partitionScenario(3);
  expect(patch.createdNodeIds.length).toBeGreaterThan(1);
  expect(patch.nodes.map((node) => node.nodeId)).toEqual(expect.arrayContaining(patch.createdNodeIds));
  expect(patch.childOrders.flatMap((order) => order.childIds)).not.toContain('trashed');
  expectSameVisibleOrder(before, patch);
});

function splitScenario(unrelated: number, parentNodeId: string | null) {
  seedUnrelated(unrelated);
  if (parentNodeId) seed(parentNodeId, null, 100);
  const content = 'Alpha one\n---\nBeta body';
  seed('source', parentNodeId, 101, content);
  seed('after', parentNodeId, 102);
  seed('hl-beta', 'source', 0, 'Beta body', highlight('b', content.indexOf('Beta body'), 'Beta body'));
  seed('hl-child', 'hl-beta', 0);
  seed('hl-alpha', 'source', 1, 'Alpha', highlight('a', 0, 'Alpha'));
  const before = openedWorkspace();
  const splitOptions = { delimiter: '---', footerText: '', headerText: '', keepDelimiter: false };
  const generatedNodes = buildSplitTopicParts({ content, ...splitOptions }).map((part, index) => ({
    anchorLink: null, content: part.body, createdAt: CREATED, isTitleManual: false, kind: 'topic' as const,
    nodeId: `part-${index}`, parentNodeId, position: index, reveal: null, title: `part-${index}`, updatedAt: CREATED
  }));
  const result = splitTopic({
    activeNodeId: 'part-0', deletedAt: '2026-07-28T00:01:00.000Z', disposition: 'replace', splitOptions, generatedNodes,
    expectedSourceRevision: loadSplitTopicPreview('source')!.revision, sourceNodeId: 'source', sourceParentNodeId: parentNodeId,
    nodeOrder: buildSplitTopicNodeOrder({ generatedNodeIds: ['part-0', 'part-1'], nodeOrder: before.nodeOrder, sourceNodeId: 'source' })
  });
  if ('status' in result) throw new Error('split preview unexpectedly changed');
  expect(result.updatedNodeIds).toEqual(['hl-alpha', 'hl-beta']);
  return { before, patch: result };
}

it.each(['folder', null])('places split Topics with moved highlights under %s in the same visible order', (parentNodeId) => {
  const { before, patch } = splitScenario(3, parentNodeId);
  expect(patch.childOrders?.flatMap((order) => order.childIds)).not.toContain('source');
  expectSameVisibleOrder(before, patch);
});

async function resetLibrary() {
  closeDatabaseConnection();
  mockedAppDataDir = path.join(tempRoot, 'larger');
  await initializeDatabase();
}

it('does not grow the body partition reply with unrelated library material', async () => {
  const small = patchIds(partitionScenario(2).patch).length;
  await resetLibrary();
  expect(patchIds(partitionScenario(40).patch)).toHaveLength(small);
});

it('does not grow the split reply with material outside the changed parents', async () => {
  const small = patchIds(splitScenario(2, 'folder').patch).length;
  await resetLibrary();
  expect(patchIds(splitScenario(40, 'folder').patch)).toHaveLength(small);
});

it('reports newly retired parts, while keeping already trashed parts out of the live child sequence', () => {
  const { patch: first } = partitionScenario(0);
  const { driver } = openDatabaseConnection();
  for (const nodeId of first.createdNodeIds) {
    writeNodeBody({ driver, nodeId, content: 'Short', title: nodeId, updatedAt: CREATED });
  }
  const extra = partitionEditedBody({ disposition: 'partition-body', sourceNodeId: 'source',
    expectedContent: '', content: 'x'.repeat(TEXT_BODY_MAX_BYTES * 3) });
  expect(extra.createdNodeIds).toHaveLength(4);
  for (const nodeId of extra.createdNodeIds) {
    writeNodeBody({ driver, nodeId, content: 'Short', title: nodeId, updatedAt: CREATED });
  }
  const result = partitionEditedBody({ disposition: 'partition-body', sourceNodeId: 'source',
    expectedContent: '', content: 'y'.repeat(TEXT_BODY_MAX_BYTES + 1) });
  const retired = extra.createdNodeIds.slice(2);
  expect(loadWorkspaceListSnapshot().trashedNodeIds).toEqual(expect.arrayContaining(retired));
  expect(result.deletedNodeIds).toEqual(retired);
  expect(result.childOrders.find(order => order.parentNodeId === 'source')?.childIds)
    .not.toEqual(expect.arrayContaining(retired));
});
