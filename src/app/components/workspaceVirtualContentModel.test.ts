import { expect, it } from 'vitest';

import type { Node } from '../../features/nodes/model/nodeTypes';
import { VIRTUAL_ROOT_NODE_ID } from '../../features/nodes/model/specialNodes';
import type { WorkspaceManualVirtualCollection } from '../../store/workspaceStore';

import { toManualVirtualCollectionNodeId } from './manualVirtualCollectionModel';
import { resolveVirtualContentItemIds } from './workspaceVirtualContentModel';

function createNode(args: {
  anchorLink?: Node['anchorLink'];
  id: string;
  kind?: Node['kind'];
  specialKind?: Node['specialKind'];
  title?: string;
}): Node {
  const kind = args.kind ?? 'topic';
  const node: Node = {
    anchorLink: args.anchorLink ?? null,
    content: '',
    createdAt: '2026-05-01T00:00:00.000Z',
    hasContent: kind !== 'folder',
    hasReveal: false,
    id: args.id,
    kind,
    parentNodeId: null,
    reading: null,
    reveal: null,
    review: null,
    title: args.title ?? args.id,
    updatedAt: '2026-05-01T00:00:00.000Z'
  };
  return args.specialKind ? { ...node, specialKind: args.specialKind } : node;
}

function createManualCollection(ids: string[]): WorkspaceManualVirtualCollection {
  return {
    availableMaterialNodeIds: ids,
    description: '',
    id: 'manual-a',
    itemCount: ids.length,
    title: 'Manual A',
    updatedAt: '2026-05-01T00:00:00.000Z'
  };
}

const emptyVirtualResultIndex = {
  resultIdsByVirtualId: new Map<string, string[]>()
} as Parameters<typeof resolveVirtualContentItemIds>[1];

it('resolves manual virtual collections in stored order and skips unavailable content rows', () => {
  const collection = createManualCollection([
    'topic-b',
    'missing-topic',
    'item-a',
    'anchored-topic',
    'special-topic',
    'trashed-topic',
    'topic-a'
  ]);

  expect(
    resolveVirtualContentItemIds(
      {
        activeVirtualNodeId: toManualVirtualCollectionNodeId(collection.id),
        manualVirtualCollections: [collection],
        nodeOrder: [VIRTUAL_ROOT_NODE_ID],
        nodesById: {
          'anchored-topic': createNode({
            anchorLink: { id: 'anchor-a', kind: 'highlight' },
            id: 'anchored-topic'
          }),
          'item-a': createNode({ id: 'item-a', kind: 'item' }),
          'special-topic': createNode({ id: 'special-topic', specialKind: 'inbox' }),
          'topic-a': createNode({ id: 'topic-a' }),
          'topic-b': createNode({ id: 'topic-b' }),
          'trashed-topic': createNode({ id: 'trashed-topic' })
        },
        trashedNodeIds: ['trashed-topic']
      },
      emptyVirtualResultIndex
    )
  ).toEqual(['topic-b', 'topic-a']);
});