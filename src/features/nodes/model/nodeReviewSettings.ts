import {
  resolveNodeSetting,
  resolveNodeShortTermSetting,
  type ResolvedNodeSetting
} from '../../../../lib/core/review/nodeSettings';
import { normalizePushQueuePriority, type PushQueuePriority } from '../../review/model/unifiedPushQueueRules';
import { DEFAULT_REVIEW_SCHEDULER_SETTINGS } from '../../settings/model/reviewSchedulerSettings';

import type { Node } from './nodeTypes';

type ReviewSettingNode = Pick<Node, 'desiredRetention' | 'enableShortTerm' | 'parentNodeId' | 'priority'>;

export { resolveNodeShortTermSetting, type ResolvedNodeSetting };

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function normalizeNodeDesiredRetention(
  value: unknown,
  fallback = DEFAULT_REVIEW_SCHEDULER_SETTINGS.desiredRetention
) {
  if (!isFiniteNumber(value)) {
    return fallback;
  }
  return Math.min(0.99, Math.max(0.01, Number(value.toFixed(2))));
}

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

export function resolveNodeDesiredRetentionSetting(
  nodeId: string,
  nodesById: Record<string, Pick<ReviewSettingNode, 'desiredRetention' | 'parentNodeId'> | undefined>,
  fallback = DEFAULT_REVIEW_SCHEDULER_SETTINGS.desiredRetention
): ResolvedNodeSetting<number> {
  return resolveNodeSetting({
    fallback,
    nodeId,
    nodesById,
    pickValue: (node) =>
      node.desiredRetention === null || node.desiredRetention === undefined
        ? undefined
        : normalizeNodeDesiredRetention(node.desiredRetention, fallback),
    normalize: (value) => value
  });
}
