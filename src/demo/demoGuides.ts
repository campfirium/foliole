import type { Node } from '../features/nodes/model/nodeTypes';
import { HOME_NODE_ID, INBOX_NODE_ID } from '../features/nodes/model/specialNodes';
import type { WorkspacePersistedState } from '../store/workspaceStore';

export const DEMO_GUIDES_NODE_ID = 'demo-guides';
export const DEMO_GUIDES_TITLE = 'Guides';

export function getDemoGuidesRequiredNodeIds(pathname: string) {
  void pathname;
  return [DEMO_GUIDES_NODE_ID];
}

export function moveDemoGuidesBeforeInbox<T extends WorkspacePersistedState>(snapshot: T): T {
  return {
    ...snapshot,
    nodeOrder: [
      HOME_NODE_ID,
      DEMO_GUIDES_NODE_ID,
      INBOX_NODE_ID,
      ...snapshot.nodeOrder.filter((nodeId) => (
        nodeId !== HOME_NODE_ID &&
        nodeId !== DEMO_GUIDES_NODE_ID &&
        nodeId !== INBOX_NODE_ID
      ))
    ]
  };
}

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
