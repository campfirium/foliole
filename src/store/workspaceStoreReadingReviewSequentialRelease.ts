import type { Node } from '../features/nodes/model/nodeTypes';
import { getCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';

import { buildSequentialReadingReadPatch } from './workspaceSequentialReading';
import type { WorkspaceState } from './workspaceStore';

export function buildReadReviewSequentialRelease(args: {
  currentNodeId: string;
  nextNodesById: WorkspaceState['nodesById'];
  now: string;
  state: WorkspaceState;
}) {
  const sequentialPatch = buildSequentialReadingReadPatch({
    defaultPriority: getCurrentReviewSchedulerSettings().pushQueue.defaultPriority,
    nodeOrder: args.state.nodeOrder,
    nodesById: args.nextNodesById,
    now: args.now,
    readNodeId: args.currentNodeId
  });
  if (!sequentialPatch) {
    return null;
  }
  const nodesForSync = sequentialPatch.changes
    .map((change) => sequentialPatch.nodesById[change.nodeId])
    .filter((changedNode): changedNode is Node => Boolean(changedNode));
  return { ...sequentialPatch, nodesForSync };
}
