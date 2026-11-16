import { requestFoliolePublishedDelete } from '../../../shared/platform/runtime/foliolePublishedManagement';
import type { WorkspaceDeleteContinuation } from '../../../store/workspaceDeleteContinuation';

import { sortNodeIdsByVisibleOrder } from './nodeListMenuTargetOrder';

type CaptureDeleteContext = (nodeIds: string[]) => WorkspaceDeleteContinuation | undefined;

let captureContext: CaptureDeleteContext | undefined;

export function registerWorkspaceTopicDeleteContext(capture: CaptureDeleteContext) {
  captureContext = capture;
  return () => {
    if (captureContext === capture) captureContext = undefined;
  };
}

export function requestNodeListDelete(args: {
  continueInItemColumn?: boolean;
  deleteNodes: (nodeIds: string[], continuation?: WorkspaceDeleteContinuation) => void;
  nodeIds: string[];
  visibleNodeIds: string[];
}) {
  if (args.nodeIds.length === 0) return;
  const nodeIds = sortNodeIdsByVisibleOrder(args.nodeIds, args.visibleNodeIds);
  const continuation = args.continueInItemColumn ? captureContext?.(nodeIds) : undefined;
  requestFoliolePublishedDelete({ nodeIds, onAllowed: () => {
    if (continuation) args.deleteNodes(nodeIds, continuation);
    else args.deleteNodes(nodeIds);
  } });
}
