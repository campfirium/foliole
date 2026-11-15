import { expect, it } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { INBOX_NODE_ID } from '../../features/nodes/model/specialNodes';

import { materialHistoryPath, selectMaterialHistory } from './materialHistory';

it('keeps the latest 100 available individual materials after filtering', () => {
  const nodes = Array.from({ length: 104 }, (_, index): Node => ({
    id: `node-${index}`,
    kind: index === 103 ? 'folder' : 'topic',
    title: index === 102 ? 'Original material' : index === 103 ? 'Inbox' : '',
    content: '',
    parentNodeId: index === 101 ? 'node-102' : index === 102 ? 'node-103' : null,
    reveal: null,
    review: null,
    createdAt: '2026-11-14T01:00:00.000Z',
    updatedAt: '2026-11-14T01:00:00.000Z'
  }));
  const nodesById = Object.fromEntries(nodes.map((node) => [node.id, node]));
  const nodeOpenStateById = Object.fromEntries(nodes.map((node, index) => [
    node.id,
    { nodeId: node.id, lastOpenedAt: new Date(Date.UTC(2026, 10, 14, 1, index)).toISOString() }
  ]));
  const state = {
    nodesById, nodeOpenStateById, nodeOrder: Object.keys(nodesById),
    trashedNodeIds: ['node-102'], trashedNodeDeletedAtById: {}
  };
  const entries = selectMaterialHistory(state);
  expect(entries).toHaveLength(100);
  expect(entries[0]?.node.id).toBe('node-101');
  expect(entries.at(-1)?.node.id).toBe('node-2');
  const ordered = selectMaterialHistory(state, ['node-102', 'node-0', 'node-1'], 'node-1');
  expect(ordered).toHaveLength(100);
  expect(ordered.slice(0, 3).map(({ node, pinned }) => [node.id, pinned])).toEqual([
    ['node-0', true], ['node-1', true], ['node-101', false]
  ]);
  expect(new Set(ordered.map(({ node }) => node.id)).size).toBe(100);
  expect(selectMaterialHistory(state, ['node-0'], 'node-1').slice(0, 3).map(({ node }) => node.id))
    .toEqual(['node-0', 'node-1', 'node-101']);
  expect(materialHistoryPath(nodesById, entries[0]!.node.parentNodeId)).toBe('Inbox / Original material');
});

it('shows the full ancestry beneath the system Inbox and omits Inbox itself', () => {
  const createNode = (id: string, title: string, parentNodeId: string | null, kind: Node['kind']): Node => ({
    id, title, parentNodeId, kind, content: '', reveal: null, review: null,
    createdAt: '2026-11-14T01:00:00.000Z',
    updatedAt: '2026-11-14T01:00:00.000Z'
  });
  const nodes = Object.fromEntries([
    createNode(INBOX_NODE_ID, 'Inbox', null, 'folder'),
    createNode('root', 'Top-level topic', INBOX_NODE_ID, 'topic'),
    createNode('section', 'Section', 'root', 'topic'),
    createNode('extract', 'Extract', 'section', 'topic')
  ].map((node) => [node.id, node]));

  expect(materialHistoryPath(nodes, 'extract')).toBe('Top-level topic / Section / Extract');
  expect(materialHistoryPath(nodes, INBOX_NODE_ID)).toBe('');
  expect(materialHistoryPath(nodes, null)).toBe('');
});
