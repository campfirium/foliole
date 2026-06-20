import type { Node } from '../features/nodes/model/nodeTypes';

export const DEMO_GUIDES_NODE_ID = 'demo-guides';
export const DEMO_GUIDES_TITLE = 'Guides';

export function createDemoGuidesNode(childNodeIds: string[], timestamp: string): Node {
  return {
    id: DEMO_GUIDES_NODE_ID,
    parentNodeId: null,
    kind: 'folder',
    title: DEMO_GUIDES_TITLE,
    isTitleManual: true,
    manualChildOrder: childNodeIds,
    content: '',
    openingText: null,
    reveal: null,
    review: null,
    reading: null,
    bodyStatus: 'empty',
    hasContent: false,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}
