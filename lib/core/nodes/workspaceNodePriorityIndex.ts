import { normalizePushQueuePriority, type PushQueuePriority, type RegularPushQueuePriority } from '../review/unifiedPushQueueRules.js';

export interface PriorityNode {
  id: string;
  parentNodeId: string | null;
  priority?: number | null;
  kind?: string | null;
  enforcePriority?: boolean | null;
}

type PriorityNodes = Readonly<Record<string, PriorityNode | undefined>>;

export function isEnforcedPriorityFolder(node: PriorityNode | undefined) {
  return node?.kind === 'folder' && node.enforcePriority === true && node.priority != null;
}

export function createWorkspaceNodePriorityIndex(
  nodesById: PriorityNodes,
  defaultPriority: RegularPushQueuePriority
): ReadonlyMap<string, PushQueuePriority> {
  return projectWorkspaceNodePriorities(nodesById, defaultPriority).priorities;
}

export function findNearestEnforcedPriority(nodeId: string, nodesById: PriorityNodes, fallback: PushQueuePriority) {
  const visited = new Set<string>();
  let node = nodesById[nodeId];
  while (node && !visited.has(node.id)) {
    if (isEnforcedPriorityFolder(node)) {
      return { ownerNodeId: node.id, value: normalizePushQueuePriority(node.priority, fallback) };
    }
    visited.add(node.id);
    node = node.parentNodeId ? nodesById[node.parentNodeId] : undefined;
  }
  return null;
}

export function projectWorkspaceNodePriorities(nodesById: PriorityNodes, defaultPriority: RegularPushQueuePriority) {
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
  }
  const enforced = projectEnforcedPriorities(nodes, children, defaultPriority);
  for (const node of nodes) {
    const own = enforced.get(node.id) ?? node.priority;
    if (own != null) {
      priorities.set(node.id, normalizePushQueuePriority(own, defaultPriority));
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
  return { priorities, enforced };
}

function projectEnforcedPriorities(nodes: PriorityNode[], children: Map<string, string[]>, fallback: PushQueuePriority) {
  const enforced = new Map<string, PushQueuePriority>();
  const pending: string[] = [];
  for (const node of nodes) {
    if (!isEnforcedPriorityFolder(node)) continue;
    enforced.set(node.id, normalizePushQueuePriority(node.priority, fallback));
    pending.push(node.id);
  }
  for (let cursor = 0; cursor < pending.length; cursor++) {
    const id = pending[cursor]!;
    for (const child of children.get(id) ?? []) {
      if (enforced.has(child)) continue;
      enforced.set(child, enforced.get(id)!);
      pending.push(child);
    }
  }
  return enforced;
}
