import { expect, it } from 'vitest';

import {
  resolveNodePrioritySetting,
  resolveNodeShortTermSetting
} from './nodeReviewSettings';
import type { Node } from './nodeTypes';

function createNode(id: string, parentNodeId: string | null, overrides: Partial<Node> = {}): Node {
  return {
    id,
    parentNodeId,
    kind: 'folder',
    title: id,
    content: '',
    anchorLink: null,
    reveal: null,
    review: null,
    priority: null,
    enableShortTerm: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  };
}

it('resolves review settings from the closest configured ancestor', () => {
  const nodesById = {
    root: createNode('root', null, { priority: 3, enableShortTerm: true }),
    child: createNode('child', 'root'),
    branch: createNode('branch', 'child', { priority: 4, enableShortTerm: false }),
    leaf: createNode('leaf', 'branch')
  };

  expect(resolveNodePrioritySetting('child', nodesById, 5)).toMatchObject({
    ownerNodeId: 'root',
    source: 'inherited',
    value: 3
  });
  expect(resolveNodePrioritySetting('leaf', nodesById, 5)).toMatchObject({
    ownerNodeId: 'branch',
    source: 'inherited',
    value: 4
  });
  expect(resolveNodeShortTermSetting('leaf', nodesById)).toMatchObject({
    ownerNodeId: 'branch',
    source: 'inherited',
    value: false
  });
});
