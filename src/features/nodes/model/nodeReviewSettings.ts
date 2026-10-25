import {
  normalizeNodeDesiredRetention,
  resolveNodeDesiredRetentionSetting,
  resolveNodeSetting,
  resolveNodeShortTermSetting,
  type ResolvedNodeSetting
} from '../../../../lib/core/review/nodeSettings';
import { normalizePushQueuePriority, type PushQueuePriority } from '../../review/model/unifiedPushQueueRules';

import type { Node } from './nodeTypes';

type ReviewSettingNode = Pick<Node, 'desiredRetention' | 'enableShortTerm' | 'parentNodeId' | 'priority'>;

export { normalizeNodeDesiredRetention, resolveNodeDesiredRetentionSetting, resolveNodeShortTermSetting, type ResolvedNodeSetting };

export function resolveNodePrioritySetting(
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
