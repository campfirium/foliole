import type { Node } from '../features/nodes/model/nodeTypes';

export function createPersistedTopicNode(id: string, values: Partial<Node>): Node {
  return {
    id,
    parentNodeId: null,
    kind: 'topic',
    title: id,
    content: '',
    hasContent: false,
    hasReveal: false,
    reveal: null,
    review: null,
    createdAt: '2026-05-13T00:00:00.000Z',
    updatedAt: '2026-05-13T00:00:00.000Z',
    ...values
  };
}
