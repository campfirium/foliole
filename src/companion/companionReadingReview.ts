import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { isReadingReviewItemNode } from '../features/review/model/reviewItemKind';
import { definedProps } from '../shared/lib/definedProps';
import { buildReadingReviewDomainPatch } from '../store/workspaceReadingReviewDomain';
import type { WorkspaceState } from '../store/workspaceStore';

interface CompanionReadingReviewResult {
  snapshot: WorkspaceSnapshot;
  syncNodeIds: string[];
}

function buildNextReadingSnapshot(args: {
  action: 'read' | 'later' | 'dismiss';
  nodeId: string;
  now: string;
  releaseSequentialReading?: boolean;
  snapshot: WorkspaceSnapshot;
}): CompanionReadingReviewResult | null {
  const node = args.snapshot.nodesById[args.nodeId];
  if (!node || !isReadingReviewItemNode(node)) {
    return null;
  }
  const domainPatch = buildReadingReviewDomainPatch({
    action: args.action,
    currentNodeId: args.nodeId,
    now: args.now,
    ...definedProps({ releaseSequentialReading: args.releaseSequentialReading }),
    snapshot: args.snapshot as Pick<WorkspaceState, 'nodesById'>,
    state: args.snapshot as Pick<WorkspaceState, 'nodeOrder' | 'nodesById'>
  });
  if (!domainPatch) return null;
  return {
    snapshot: {
      ...args.snapshot,
      nodesById: domainPatch.nextNodesById as WorkspaceSnapshot['nodesById']
    },
    syncNodeIds: domainPatch.nextNodesForSync.map((nextNode) => nextNode.id)
  };
}

export function readCompanionReviewTopic(args: {
  nodeId: string;
  now?: string;
  releaseSequentialReading?: boolean;
  snapshot: WorkspaceSnapshot;
}) {
  return buildNextReadingSnapshot({
    action: 'read',
    nodeId: args.nodeId,
    now: args.now ?? new Date().toISOString(),
    ...definedProps({ releaseSequentialReading: args.releaseSequentialReading }),
    snapshot: args.snapshot
  });
}

export function postponeCompanionReviewTopic(args: {
  nodeId: string;
  now?: string;
  snapshot: WorkspaceSnapshot;
}) {
  return buildNextReadingSnapshot({
    action: 'later',
    nodeId: args.nodeId,
    now: args.now ?? new Date().toISOString(),
    snapshot: args.snapshot
  });
}

export function dismissCompanionReviewTopic(args: {
  nodeId: string;
  now?: string;
  snapshot: WorkspaceSnapshot;
}) {
  return buildNextReadingSnapshot({
    action: 'dismiss',
    nodeId: args.nodeId,
    now: args.now ?? new Date().toISOString(),
    snapshot: args.snapshot
  });
}
