import { openWorkspaceNodeWithPreparedDocument } from '../../store/workspaceNodePreparation';
import { useWorkspaceStore } from '../../store/workspaceStore';

const INBOX_NODE_ID = 'special-inbox';

export function selectReadwiseBookNode(nodeId: string, onSelectNode?: (nodeId: string) => void) {
  if (onSelectNode) {
    onSelectNode(nodeId);
    return;
  }
  void openWorkspaceNodeWithPreparedDocument(nodeId);
}

function placeNodeAtInboxTop(
  nodeOrder: string[],
  nodesById: Record<string, { parentNodeId: string | null } | undefined>,
  nodeId: string
) {
  const orderWithoutNode = nodeOrder.filter((currentNodeId) => currentNodeId !== nodeId);
  const firstInboxChildIndex = orderWithoutNode.findIndex(
    (currentNodeId) => nodesById[currentNodeId]?.parentNodeId === INBOX_NODE_ID
  );
  if (firstInboxChildIndex >= 0) {
    orderWithoutNode.splice(firstInboxChildIndex, 0, nodeId);
    return orderWithoutNode;
  }
  const inboxIndex = orderWithoutNode.indexOf(INBOX_NODE_ID);
  if (inboxIndex >= 0) {
    orderWithoutNode.splice(inboxIndex + 1, 0, nodeId);
    return orderWithoutNode;
  }
  return [...orderWithoutNode, nodeId];
}

export function applyResetReadwiseBookImportToWorkspace(result: {
  content: string;
  node_id: string;
  removed_node_ids: string[];
  title: string;
  updated_at: string;
}) {
  useWorkspaceStore.setState((state) => {
    const removedNodeIds = new Set(result.removed_node_ids);
    const nextNodesById = { ...state.nodesById };
    const nextNodeViewById = { ...state.nodeViewById };
    removedNodeIds.forEach((nodeId) => {
      delete nextNodesById[nodeId];
      delete nextNodeViewById[nodeId];
    });

    const currentNode = nextNodesById[result.node_id];
    const baseNode = currentNode ?? {
      anchorLink: null,
      content: '',
      createdAt: result.updated_at,
      desiredRetention: null,
      hasContent: false,
      hasReveal: false,
      hideTitleHeading: false,
      id: result.node_id,
      isTitleManual: true,
      kind: 'topic' as const,
      parentNodeId: 'special-inbox',
      priority: null,
      reveal: null,
      review: null,
      title: result.title,
      updatedAt: result.updated_at
    };

    nextNodesById[result.node_id] = {
      ...baseNode,
      content: result.content,
      hasContent: true,
      hasReveal: false,
      reveal: null,
      title: currentNode?.title ?? result.title,
      updatedAt: result.updated_at
    };
    nextNodeViewById[result.node_id] = { scrollTop: 0, selection: { from: 0, to: 0 } };

    const nextNodeOrder = placeNodeAtInboxTop(
      state.nodeOrder.filter((nodeId) => !removedNodeIds.has(nodeId)),
      nextNodesById,
      result.node_id
    );

    return {
      nodeOrder: nextNodeOrder,
      nodeViewById: nextNodeViewById,
      nodesById: nextNodesById
    };
  });
}
