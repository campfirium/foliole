import { findNearestEnforcedPriority, type PriorityNode } from '../../../../lib/core/nodes/workspaceNodePriorityIndex';
import {
  normalizeNodeDesiredRetention,
  resolveNodeDesiredRetentionSetting,
  resolveNodeSetting,
  resolveNodeShortTermSetting,
  type ResolvedNodeSetting
} from '../../../../lib/core/review/nodeSettings';
import { normalizePushQueuePriority, type PushQueuePriority } from '../../review/model/unifiedPushQueueRules';

import type { Node } from './nodeTypes';

type ReviewSettingNode = Pick<Node, 'desiredRetention' | 'enableShortTerm'> & PriorityNode;
export type ResolvedNodePriority = ResolvedNodeSetting<PushQueuePriority> & { enforced?: true };

export { normalizeNodeDesiredRetention, resolveNodeDesiredRetentionSetting, resolveNodeShortTermSetting, type ResolvedNodeSetting };

export function resolveNodePrioritySetting(
  nodeId: string,
  nodesById: Record<string, ReviewSettingNode | undefined>,
  fallback: PushQueuePriority
): ResolvedNodePriority {
  const enforced = findNearestEnforcedPriority(nodeId, nodesById, fallback);
  if (enforced && enforced.ownerNodeId !== nodeId) {
    return { ...enforced, source: 'inherited', enforced: true };
  }
  return resolveUnenforcedNodePriority(nodeId, nodesById, fallback);
}

export function resolveUnenforcedNodePriority(
  nodeId: string,
  nodesById: Record<string, ReviewSettingNode | undefined>,
  fallback: PushQueuePriority
): ResolvedNodeSetting<PushQueuePriority> {
  return resolveNodeSetting({
    fallback,
    nodeId,
    nodesById,
    pickValue: (node) =>
      node.priority === null || node.priority === undefined
        ? undefined
        : normalizePushQueuePriority(node.priority, fallback),
    normalize: (value) => value
  });
}
