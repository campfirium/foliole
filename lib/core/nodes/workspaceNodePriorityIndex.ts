import { normalizePushQueuePriority, type PushQueuePriority, type RegularPushQueuePriority } from '../review/unifiedPushQueueRules.js';

interface PriorityNode {
  id: string;
  parentNodeId: string | null;
  priority?: number | null;
}

// Contains resolved values only, with no learning profiles or consumer-time inheritance.
export function createWorkspaceNodePriorityIndex(
  nodesById: Readonly<Record<string, PriorityNode | undefined>>,
  defaultPriority: RegularPushQueuePriority
): ReadonlyMap<string, PushQueuePriority> {
  const priorities = new Map<string, PushQueuePriority>();
  const children = new Map<string, string[]>();
  const pending: string[] = [];
  const nodes = Object.values(nodesById).filter((node): node is PriorityNode => Boolean(node));
  for (const node of nodes) {
    if (node.parentNodeId) {
      const siblings = children.get(node.parentNodeId) ?? [];
      siblings.push(node.id);
      children.set(node.parentNodeId, siblings);
    }
    if (node.priority !== null && node.priority !== undefined) {
      priorities.set(node.id, normalizePushQueuePriority(node.priority, defaultPriority));
      pending.push(node.id);
    } else if (!node.parentNodeId || !nodesById[node.parentNodeId]) {
      priorities.set(node.id, defaultPriority);
      pending.push(node.id);
    }
  }
  for (let cursor = 0; cursor < pending.length; cursor++) {
    const id = pending[cursor]!;
    for (const child of children.get(id) ?? []) {
      if (priorities.has(child)) continue;
      priorities.set(child, priorities.get(id)!);
      pending.push(child);
    }
  }
  // A parent cycle without an explicit priority has no inherited value.
  for (const node of nodes) if (!priorities.has(node.id)) priorities.set(node.id, defaultPriority);
  return priorities;
}
