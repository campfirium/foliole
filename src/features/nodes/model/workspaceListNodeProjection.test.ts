import { expect, it } from 'vitest';

import { patchWorkspaceRecord } from '../../../shared/workspaceRecordPatch';

import type { Node } from './nodeTypes';
import { projectWorkspaceListNodesById } from './workspaceListNode';

function createTopicNode(overrides: Partial<Node> = {}): Node {
  return {
    id: 'node-1',
    parentNodeId: null,
    kind: 'topic',
    title: 'Atlas',
    content: 'Version 1',
    reveal: '',
    review: null,
    createdAt: '2026-04-08T00:00:00.000Z',
    updatedAt: '2026-04-08T00:00:00.000Z',
    ...overrides
  };
}

it.each([false, true])('publishes changed modification time with local patch=%s', (localPatch) => {
  const source = { 'node-1': createTopicNode(), other: createTopicNode({ id: 'other' }) };
  const initialProjection = projectWorkspaceListNodesById(source);
  const updatedAt = '2026-04-08T00:00:01.000Z';
  const node = { ...source['node-1'], updatedAt };
  const nextSource = localPatch
    ? patchWorkspaceRecord(source, { 'node-1': node })
    : { ...source, 'node-1': node };
  const nextProjection = projectWorkspaceListNodesById(nextSource, initialProjection);

  expect(nextProjection['node-1']?.updatedAt).toBe(updatedAt);
  expect(initialProjection['node-1']?.updatedAt).toBe(source['node-1'].updatedAt);
  expect(nextProjection.other).toBe(initialProjection.other);
  expect(projectWorkspaceListNodesById(nextSource, nextProjection)).toBe(nextProjection);
});
