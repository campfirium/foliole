import type { PushQueuePriority } from '../../review/model/unifiedPushQueueRules';
import { normalizePushQueuePriority } from '../../review/model/unifiedPushQueueRules';
import { DEFAULT_REVIEW_SCHEDULER_SETTINGS } from '../../settings/model/reviewSchedulerSettings';

import type { Node } from './nodeTypes';

export type NodeSettingSource = 'explicit' | 'inherited' | 'default';

export interface ResolvedNodeSetting<T> {
  ownerNodeId: string | null;
  source: NodeSettingSource;
  value: T;
}

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

function resolveNodeSetting<T>(args: {
  fallback: T;
  nodeId: string;
  nodesById: Record<string, Node>;
  pickValue: (node: Node) => T | null | undefined;
  normalize: (value: T, fallback: T) => T;
}): ResolvedNodeSetting<T> {
  const visited = new Set<string>();
  let currentNodeId: string | null = args.nodeId;
  let depth = 0;

  while (currentNodeId) {
    if (visited.has(currentNodeId)) {
      break;
    }
    visited.add(currentNodeId);
    const currentNode: Node | undefined = args.nodesById[currentNodeId];
    if (!currentNode) {
      break;
    }
    const candidate = args.pickValue(currentNode);
    if (candidate !== null && candidate !== undefined) {
      return {
        ownerNodeId: currentNodeId,
        source: depth === 0 ? 'explicit' : 'inherited',
        value: args.normalize(candidate, args.fallback)
      };
    }
    currentNodeId = currentNode.parentNodeId;
    depth += 1;
  }

  return {
    ownerNodeId: null,
    source: 'default',
    value: args.fallback
  };
}

export function resolveNodePrioritySetting(
  nodeId: string,
  nodesById: Record<string, Node>,
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
  nodesById: Record<string, Node>,
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
