import { expect, it } from 'vitest';

import { patchWorkspaceRecord } from '../../../shared/workspaceRecordPatch';

import type { Node } from './nodeTypes';
import { projectWorkspaceListNodesById } from './workspaceListNode';

function createNode(id: string): Node {
  return {
    content: '', createdAt: '2026-09-22T00:00:00.000Z', hasContent: true,
    hasReveal: false, id, kind: 'topic', parentNodeId: null, reading: null,
    reveal: null, review: null, title: id, updatedAt: '2026-09-22T00:00:00.000Z'
  };
}

it('preserves the list projection when a local patch only loads body text', () => {
  const source = { 'node-1': createNode('node-1'), 'node-2': createNode('node-2') };
  const first = projectWorkspaceListNodesById(source);
  const nextSource = patchWorkspaceRecord(source, {
    'node-1': { ...source['node-1'], content: 'Loaded body' }
  });

  const second = projectWorkspaceListNodesById(nextSource, first);

  expect(second).toBe(first);
});

it('updates the affected list entry when a local patch changes a list field', () => {
  const source = { 'node-1': createNode('node-1'), 'node-2': createNode('node-2') };
  const first = projectWorkspaceListNodesById(source);
  const nextSource = patchWorkspaceRecord(source, {
    'node-1': { ...source['node-1'], title: 'Renamed' }
  });

  const second = projectWorkspaceListNodesById(nextSource, first);

  expect(second).not.toBe(first);
  expect(second['node-1']?.title).toBe('Renamed');
  expect(second['node-2']).toBe(first['node-2']);
});
