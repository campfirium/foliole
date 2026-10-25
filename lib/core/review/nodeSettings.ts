import { clampDesiredRetention, DEFAULT_REVIEW_SCHEDULER_SETTINGS } from './settings.js';

export type NodeSettingSource = 'explicit' | 'inherited' | 'default';

export interface ResolvedNodeSetting<T> {
  ownerNodeId: string | null;
  source: NodeSettingSource;
  value: T;
}

export interface ReviewSettingNode {
  parentNodeId: string | null;
  enableShortTerm?: boolean | null;
}

export function resolveNodeSetting<T, TNode extends { parentNodeId: string | null }>(args: {
  fallback: T;
  nodeId: string;
  nodesById: Record<string, TNode | undefined>;
  pickValue: (node: TNode) => T | null | undefined;
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
    const currentNode: TNode | undefined = args.nodesById[currentNodeId];
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

export function resolveNodeShortTermSetting<TNode extends ReviewSettingNode>(
  nodeId: string,
  nodesById: Record<string, TNode | undefined>,
  fallback = false
): ResolvedNodeSetting<boolean> {
  return resolveNodeSetting({
    fallback,
    nodeId,
    nodesById,
    pickValue: (node) => node.enableShortTerm,
    normalize: (value) => value === true
  });
}

export function normalizeNodeDesiredRetention(
  value: unknown,
  fallback = DEFAULT_REVIEW_SCHEDULER_SETTINGS.desiredRetention
) {
  return typeof value === 'number' && Number.isFinite(value) ? clampDesiredRetention(value) : fallback;
}

export function resolveNodeDesiredRetentionSetting<TNode extends {
  parentNodeId: string | null;
  desiredRetention?: number | null;
}>(nodeId: string, nodesById: Record<string, TNode | undefined>,
  fallback = DEFAULT_REVIEW_SCHEDULER_SETTINGS.desiredRetention): ResolvedNodeSetting<number> {
  return resolveNodeSetting({ fallback, nodeId, nodesById,
    pickValue: node => node.desiredRetention,
    normalize: normalizeNodeDesiredRetention });
}
