import { isDesktopRuntime } from '../../shared/platform/runtime';

import type { useWorkspaceSelectors } from './appControllerState';

export function canSendCurrentTopicToEdge(args: {
  activeNodeId: string | null;
  isViewingTrashNode: boolean;
  isExternalViewOpen?: boolean;
  isFoliolePublishedContext?: boolean;
  isVirtualViewOpen?: boolean;
  ws: Pick<ReturnType<typeof useWorkspaceSelectors>, 'nodesById' | 'trashedNodeIds'>;
}) {
  const id = args.activeNodeId;
  if (!isDesktopRuntime() || !id || args.isViewingTrashNode || args.isExternalViewOpen ||
    args.isFoliolePublishedContext || args.isVirtualViewOpen ||
    args.ws.trashedNodeIds.includes(id)) return false;
  const node = args.ws.nodesById[id];
  return node?.kind === 'topic' && !node.anchorLink;
}
