import { deriveNodeTitleFromContent } from '../features/nodes/model/deriveNodeTitle';
import { VIRTUAL_ROOT_NODE_ID } from '../features/nodes/model/specialNodes';

import { insertNodeBlockUnderParent } from './workspaceNodeTreeOrder';
import { reconcileReviewSession } from './workspaceReviewSessionSync';
import type { WorkspaceState } from './workspaceStore';
import { resolveCreatedNodeTitleState } from './workspaceUntitledNodeTitle';

type WorkspaceSet = (
  partial:
    | WorkspaceState
    | Partial<WorkspaceState>
    | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)
) => void;

type NodeSnapshot = WorkspaceState['nodesById'][string];

export function createVirtualNodeAction(
  set: WorkspaceSet,
  onNodeCreated?: (node: NodeSnapshot) => void,
  onNodeOrderChanged?: (nodeOrder: string[]) => void
): WorkspaceState['createVirtualNode'] {
  return () => {
    const nodeId = `node-${crypto.randomUUID()}`;
    const timestamp = new Date().toISOString();
    let createdNode: NodeSnapshot | null = null;
    let nextNodeOrder: string[] | null = null;

    set((state) => {
      const untitledState = resolveCreatedNodeTitleState(deriveNodeTitleFromContent(''), VIRTUAL_ROOT_NODE_ID, state);
      const nextNode = {
        id: nodeId,
        parentNodeId: VIRTUAL_ROOT_NODE_ID,
        kind: 'folder' as const,
        specialKind: 'virtual' as const,
        title: untitledState.title,
        isTitleManual: true,
        content: '',
        anchorLink: null,
        reveal: null,
        review: null,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      const updatedNodesById = {
        ...state.nodesById,
        [nodeId]: nextNode
      };
      nextNodeOrder = insertNodeBlockUnderParent(state.nodeOrder, [nodeId], VIRTUAL_ROOT_NODE_ID, updatedNodesById);
      createdNode = nextNode;
      return {
        activeNodeId: nodeId,
        nodeOrder: nextNodeOrder,
        nodesById: updatedNodesById,
        untitledSequenceByParent: untitledState.untitledSequenceByParent,
        reviewSession: reconcileReviewSession(
          {
            ...state,
            activeNodeId: nodeId,
            nodeOrder: nextNodeOrder,
            nodesById: updatedNodesById,
            untitledSequenceByParent: untitledState.untitledSequenceByParent
          },
          nodeId
        )
      };
    });
    if (createdNode) {
      onNodeCreated?.(createdNode);
      if (nextNodeOrder) {
        onNodeOrderChanged?.(nextNodeOrder);
      }
    }
    return nodeId;
  };
}
