import type { useWorkspaceSelectors } from './appControllerState';

type NodeActionGuardArgs = {
  activeNodeId: string | null;
  isViewingTrashNode: boolean;
  ws: Pick<ReturnType<typeof useWorkspaceSelectors>, 'nodesById' | 'trashedNodeIds'>;
};

function getActiveTopic(args: NodeActionGuardArgs) {
  if (!args.activeNodeId || args.isViewingTrashNode || args.ws.trashedNodeIds.includes(args.activeNodeId)) {
    return null;
  }
  const activeNode = args.ws.nodesById[args.activeNodeId];
  return activeNode?.kind === 'topic' ? activeNode : null;
}

export function canDelayReviewTopic(args: NodeActionGuardArgs) {
  const activeNode = getActiveTopic(args);
  return Boolean(activeNode && activeNode.reading?.state !== 'dismissed');
}
