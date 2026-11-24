// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { readParentChildOrder, ROOT_CHILD_ORDER_ID } from '../../lib/core/database/parentChildOrder.js';
import type { NativeSplitTopicMutationArgs } from '../../lib/platform/nativeNodeMutationContract.js';

let mockedAppDataDir = '/tmp/foliole-split-topic-tests';
const publishGuardMocks = vi.hoisted(() => ({ assertFoliolePublishedDeleteAllowed: vi.fn() }));

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));
vi.mock('../foliolePublish/foliolePublishManagement.js', () => publishGuardMocks);

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { replaceNodeOrder, restoreNodes, upsertNodeSnapshot } from './nodeMutations.js';
import { getNodeRow, seedNode } from './nodeMutations.test.helpers.js';
import { splitTopic as commitSplitTopic } from './splitTopicMutation.js';
import { loadSplitTopicPreview } from './splitTopicPreview.js';

type DialogSplit = Exclude<NativeSplitTopicMutationArgs, { disposition: 'partition-body' }>;
type SplitInput = Omit<Extract<DialogSplit, { disposition: 'replace' }>, 'expectedSourceRevision' | 'splitOptions'> |
  Omit<Extract<DialogSplit, { disposition: 'keep-as-parent' }>, 'expectedSourceRevision'>;

function splitTopic(input: SplitInput, expectedSourceRevision = loadSplitTopicPreview(input.sourceNodeId)!.revision) {
  const args = { expectedSourceRevision };
  const splitOptions = { delimiter: '---', footerText: '', headerText: '', keepDelimiter: false };
  return commitSplitTopic(input.disposition === 'replace' ? { ...input, ...args, splitOptions } : { ...input, ...args });
}

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-split-topic-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
  publishGuardMocks.assertFoliolePublishedDeleteAllowed.mockReset();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function generatedTopic(nodeId: string, parentNodeId: string | null, position: number) {
  return {
    anchorLink: null,
    content: `# ${nodeId}`,
    createdAt: '2026-07-28T00:00:00.000Z',
    isTitleManual: false,
    kind: 'topic' as const,
    nodeId,
    parentNodeId,
    position,
    reveal: null,
    title: nodeId,
    updatedAt: '2026-07-28T00:00:00.000Z'
  };
}

function readSyncDirty(nodeId: string) {
  return openDatabaseConnection().sqlite
    .prepare('SELECT sync_dirty FROM nodes WHERE id = ?')
    .get(nodeId) as { sync_dirty: number } | undefined;
}

function childIds(parentId: string) {
  return readParentChildOrder(openDatabaseConnection().driver, parentId === 'parent-child-order:root' ? null : parentId).childIds;
}

function mutationState() {
  const driver = openDatabaseConnection().driver;
  return {
    nodes: driver.queryAll('SELECT * FROM nodes ORDER BY id'),
    orders: driver.queryAll('SELECT * FROM parent_order_sources ORDER BY parent_id, author_id'),
    versions: driver.queryAll('SELECT * FROM node_sync_versions ORDER BY version_id'),
    state: driver.queryAll('SELECT * FROM sync_object_state ORDER BY object_type, object_id'),
    sequence: driver.queryAll('SELECT * FROM sync_state_sequence'),
    dispositions: driver.queryAll('SELECT * FROM source_disposition_states ORDER BY source_kind, source_scope, original_title')
  };
}

it('atomically creates root sibling Topics, updates order, trashes the source, and returns a patch', () => {
  seedNode('root-a', null, 0);
  seedTopic('source', null, 1, '# part-a---# part-b');
  seedNode('root-b', null, 2);

  const result = splitTopic({
    activeNodeId: 'part-a',
    deletedAt: '2026-07-28T00:01:00.000Z',
    disposition: 'replace',
    generatedNodes: [generatedTopic('part-a', null, 2), generatedTopic('part-b', null, 3)],
    nodeOrder: ['root-a', 'source', 'part-a', 'part-b', 'root-b'],
    sourceNodeId: 'source',
    sourceParentNodeId: null
  });

  expect(result).toMatchObject({
    activeNodeId: 'part-a',
    createdNodeIds: ['part-a', 'part-b'],
    deletedNodeIds: ['source'],
    nodeOrder: ['root-a', 'source', 'part-a', 'part-b', 'root-b']
  });
  expect(getNodeRow('source')?.deleted_at).toBe('2026-07-28T00:01:00.000Z');
  expect(getNodeRow('part-a')?.parent_id).toBeNull();
  expect(childIds(ROOT_CHILD_ORDER_ID)).toEqual([
    'root-a', 'source', 'part-a', 'part-b', 'root-b', 'special-inbox', 'special-virtual-root'
  ]);
  expect(readSyncDirty('source')?.sync_dirty).toBe(0);
  expect(readSyncDirty('part-a')?.sync_dirty).toBe(0);
  expect(publishGuardMocks.assertFoliolePublishedDeleteAllowed).toHaveBeenCalledWith(['source']);
});

it('creates generated Topics as folder siblings without hiding them when the source is restored', () => {
  seedNode('folder', null, 0);
  seedTopic('source', 'folder', 1, '# part-a---# part-b');
  seedNode('sibling', 'folder', 2);

  splitTopic({
    activeNodeId: 'part-a',
    deletedAt: '2026-07-28T00:01:00.000Z',
    disposition: 'replace',
    generatedNodes: [generatedTopic('part-a', 'folder', 2), generatedTopic('part-b', 'folder', 3)],
    nodeOrder: ['folder', 'source', 'part-a', 'part-b', 'sibling'],
    sourceNodeId: 'source',
    sourceParentNodeId: 'folder'
  });
  restoreNodes({ nodeIds: ['source'] });

  expect(getNodeRow('source')?.deleted_at).toBeNull();
  expect(getNodeRow('part-a')?.deleted_at).toBeNull();
  expect(getNodeRow('part-b')?.parent_id).toBe('folder');
  expect(childIds('folder')).toEqual(['source', 'part-a', 'part-b', 'sibling']);
  expect(childIds(ROOT_CHILD_ORDER_ID)).toEqual(['folder', 'special-inbox', 'special-virtual-root']);
});

it('keeps the source and inserts generated Topics as its first direct children', () => {
  seedNode('folder', null, 0);
  seedTopic('source', 'folder', 1, '# part-a---# part-b');
  seedNode('old-child', 'source', 2);
  seedNode('grandchild', 'old-child', 3);
  seedNode('sibling', 'folder', 4);

  const result = splitTopic({
    activeNodeId: 'part-a',
    disposition: 'keep-as-parent',
    generatedNodes: [generatedTopic('part-a', 'source', 2), generatedTopic('part-b', 'source', 3)],
    nodeOrder: ['folder', 'source', 'part-a', 'part-b', 'old-child', 'grandchild', 'sibling'],
    sourceNodeId: 'source',
    sourceParentNodeId: 'folder'
  });

  expect(result).toHaveProperty('deletedNodeIds', []);
  expect(getNodeRow('source')?.deleted_at).toBeNull();
  expect(getNodeRow('part-a')?.parent_id).toBe('source');
  expect(getNodeRow('old-child')?.parent_id).toBe('source');
  expect(getNodeRow('grandchild')?.parent_id).toBe('old-child');
  expect(childIds('source')).toEqual(['part-a', 'part-b', 'old-child']);
  expect(childIds('old-child')).toEqual(['grandchild']);
  expect(childIds('folder')).toEqual(['source', 'sibling']);
  expect(childIds(ROOT_CHILD_ORDER_ID)).toEqual(['folder', 'special-inbox', 'special-virtual-root']);
  expect(publishGuardMocks.assertFoliolePublishedDeleteAllowed).not.toHaveBeenCalled();
});

it('rolls back generated Topics, order, and source Trash when any write fails', () => {
  seedTopic('source', null, 0, '# part-a---# part-b');
  seedNode('sibling', null, 1);
  replaceNodeOrder(['source', 'sibling']);
  const before = mutationState();
  openDatabaseConnection().sqlite.exec(`CREATE TRIGGER reject_second_generated BEFORE INSERT ON nodes
    WHEN NEW.id = 'part-b' BEGIN SELECT RAISE(ABORT, 'injected generated write failure'); END`);

  expect(() => splitTopic({
    activeNodeId: 'part-a',
    deletedAt: '2026-07-28T00:01:00.000Z',
    disposition: 'replace',
    generatedNodes: [generatedTopic('part-a', null, 1), generatedTopic('part-b', null, 2)],
    nodeOrder: ['source', 'part-a', 'part-b', 'sibling'],
    sourceNodeId: 'source',
    sourceParentNodeId: null
  })).toThrow('injected generated write failure');

  expect(mutationState()).toEqual(before);
  expect(getNodeRow('source')?.deleted_at).toBeNull();
  expect(getNodeRow('part-a')).toBeUndefined();
  expect(getNodeRow('part-b')).toBeUndefined();
  expect(childIds(ROOT_CHILD_ORDER_ID)).toEqual(['source', 'sibling', 'special-inbox', 'special-virtual-root']);
  closeDatabaseConnection();
  expect(mutationState()).toEqual(before);
});

function seedTopic(nodeId: string, parentNodeId: string | null, position: number, content: string, anchorLink: NonNullable<Parameters<typeof upsertNodeSnapshot>[0]['anchorLink']> | null = null) {
  upsertNodeSnapshot({
    anchorLink, content, createdAt: '2026-03-06T00:00:00.000Z', isTitleManual: true, kind: 'topic', nodeId,
    parentNodeId, position, reveal: null, title: nodeId, updatedAt: '2026-03-06T00:00:00.000Z'
  });
}

function highlightAnchor(id: string, from: number, to: number, originalText: string) {
  return { id, kind: 'highlight' as const, locator: { from, originalText, to } };
}

it('moves source highlights onto the generated part that now holds their text', () => {
  const source = 'Alpha one\n---\n## Beta two\nBeta body';
  seedTopic('source', null, 0, source);
  const betaFrom = source.indexOf('Beta body');
  seedTopic('hl-alpha', 'source', 0, 'Alpha', highlightAnchor('a', 0, 5, 'Alpha'));
  seedTopic('hl-beta', 'source', 1, 'Beta body', highlightAnchor('b', betaFrom, betaFrom + 9, 'Beta body'));
  seedTopic('hl-cross', 'source', 2, 'cross', highlightAnchor('c', 6, 20, source.slice(6, 20)));
  seedTopic('hl-child', 'hl-beta', 0, 'nested');

  const result = splitTopic({
    activeNodeId: 'part-a',
    deletedAt: '2026-07-28T00:01:00.000Z',
    disposition: 'replace',
    generatedNodes: [
      { ...generatedTopic('part-a', null, 1), content: 'Alpha one\n' },
      { ...generatedTopic('part-b', null, 2), content: '\n# Beta two\nBeta body' }
    ],
    nodeOrder: ['source', 'part-a', 'part-b', 'hl-alpha', 'hl-beta', 'hl-cross', 'hl-child'],
    sourceNodeId: 'source',
    sourceParentNodeId: null
  });

  expect(getNodeRow('hl-alpha')?.parent_id).toBe('part-a');
  expect(JSON.parse(getNodeRow('hl-alpha')!.anchor_link!).locator).toEqual({ from: 0, originalText: 'Alpha', to: 5 });
  expect(getNodeRow('hl-beta')?.parent_id).toBe('part-b');
  const betaBody = '\n# Beta two\nBeta body';
  expect(JSON.parse(getNodeRow('hl-beta')!.anchor_link!).locator).toEqual({
    from: betaBody.indexOf('Beta body'), originalText: 'Beta body', to: betaBody.length
  });
  expect(getNodeRow('hl-child')?.parent_id).toBe('hl-beta');
  expect(getNodeRow('hl-cross')?.parent_id).toBe('source');
  if ('status' in result) throw new Error('split preview unexpectedly changed');
  expect(result.updatedNodeIds).toEqual(['hl-alpha', 'hl-beta']);
  expect(result.nodes.map((node) => node.nodeId)).toEqual(['part-a', 'part-b', 'hl-alpha', 'hl-beta']);
  expect(childIds('part-b')).toEqual(['hl-beta']);
  expect(readSyncDirty('hl-beta')?.sync_dirty).toBe(0);
});

it('leaves highlights with the active source when the stored body no longer matches the split', () => {
  seedTopic('source', null, 0, 'Edited---Beta');
  const shown = loadSplitTopicPreview('source')!;
  seedTopic('source', null, 0, 'Alpha---Beta');
  seedTopic('hl-alpha', 'source', 0, 'Alpha', highlightAnchor('a', 0, 5, 'Alpha'));

  const result = splitTopic({
    activeNodeId: 'part-a',
    deletedAt: '2026-07-28T00:01:00.000Z',
    disposition: 'replace',
    generatedNodes: [
      { ...generatedTopic('part-a', null, 1), content: 'Edited' },
      { ...generatedTopic('part-b', null, 2), content: 'Beta' }
    ],
    nodeOrder: ['source', 'part-a', 'part-b', 'hl-alpha'],
    sourceNodeId: 'source',
    sourceParentNodeId: null
  }, shown.revision);

  expect(result).toMatchObject({ status: 'source-changed' });
  expect(getNodeRow('source')?.deleted_at).toBeNull();
  expect(getNodeRow('hl-alpha')?.parent_id).toBe('source');
});
