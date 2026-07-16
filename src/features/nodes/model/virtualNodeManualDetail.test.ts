import { expect, it } from 'vitest';

import { createManualVirtualNodeFilter } from '../../../../lib/core/nodes/virtualNodeFilter';

import type { Node } from './nodeTypes';
import { VIRTUAL_ROOT_NODE_ID } from './specialNodes';
import { getVirtualNodeResultReferences } from './virtualNodeDetail';

const baseNode: Node = {
  anchorLink: null,
  content: '',
  createdAt: '2026-03-06T00:00:00.000Z',
  id: 'node-1',
  isTitleManual: true,
  kind: 'topic',
  parentNodeId: null,
  reveal: null,
  review: null,
  title: 'Base node',
  updatedAt: '2026-03-06T00:00:00.000Z'
};

it('uses manual child order as membership for manual virtual Folders without Topic YAML', () => {
  const manual = {
    ...baseNode,
    id: 'manual',
    kind: 'folder' as const,
    manualChildOrder: ['topic-b', 'missing', 'topic-a'],
    parentNodeId: VIRTUAL_ROOT_NODE_ID,
    title: 'Manual',
    virtualFilter: createManualVirtualNodeFilter()
  };
  const nodes = {
    manual,
    'topic-a': { ...baseNode, id: 'topic-a', title: 'A' },
    'topic-b': { ...baseNode, id: 'topic-b', title: 'B' }
  };

  expect(getVirtualNodeResultReferences('manual', nodes, manual.virtualFilter)).toEqual([
    { sourceNodeId: 'topic-b' },
    { sourceNodeId: 'topic-a' }
  ]);
});
