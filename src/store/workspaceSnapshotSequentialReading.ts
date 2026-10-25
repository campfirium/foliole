import type { WorkspaceNodeSnapshot } from '../../lib/core/database/workspaceSnapshotHelpers';
import type { Node } from '../features/nodes/model/nodeTypes';
import { getCurrentReviewSchedulerSettings } from '../features/settings/model/reviewSchedulerSettings';

import { buildSequentialReadingMaintenancePatch } from './workspaceSequentialReadingMaintenance';

function schedulingNodes(nodes: Record<string, WorkspaceNodeSnapshot>): Record<string, Node> {
  return Object.fromEntries(Object.entries(nodes).map(([id, node]) => [id, {
    ...node, anchorLink: node.anchorLink ? { id: node.anchorLink.id, kind: node.anchorLink.kind } : null
  }]));
}

export function maintainWorkspaceSnapshotSequentialReading(args: {
  before: Record<string, WorkspaceNodeSnapshot>; after: Record<string, WorkspaceNodeSnapshot>;
  changedNodeIds: string[]; nodeOrder: string[]; now: string;
}) {
  return buildSequentialReadingMaintenancePatch({
    changedRootNodeIds: args.changedNodeIds, defaultPriority: getCurrentReviewSchedulerSettings().pushQueue.defaultPriority,
    previousNodesById: schedulingNodes(args.before), nodesById: schedulingNodes(args.after),
    nodeOrder: args.nodeOrder, now: args.now
  })?.changes ?? [];
}
