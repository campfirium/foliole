import { hasNodeContent, type Node, type NodeReadingProfile } from '../features/nodes/model/nodeTypes';
import { isProtectedRootNode } from '../features/nodes/model/specialNodes';
import { isReadingReviewItemNode } from '../features/review/model/reviewItemKind';
import type { PushQueuePriority } from '../features/review/model/unifiedPushQueueRules';

import { cloneReadingProfile } from './workspaceActionHistoryReading';
import type { WorkspaceState } from './workspaceStore';

export interface SequentialReadingChange {
  afterReading: NodeReadingProfile | null;
  beforeReading: NodeReadingProfile | null;
  nodeId: string;
}

interface SequentialReadingArgs {
  defaultPriority: PushQueuePriority;
  nodeOrder: string[];
  nodesById: WorkspaceState['nodesById'];
  now: string;
}

interface SequentialReadingPatch {
  changes: SequentialReadingChange[];
  nodesById: WorkspaceState['nodesById'];
  sourceNodeId: string;
}

function isFolderNode(node: Node | undefined) {
  return node?.kind === 'folder';
}

export function isSequentialReadingSourceTopic(
  node: Node | null | undefined,
  nodesById: WorkspaceState['nodesById']
) {
  if (!node || node.kind !== 'topic' || isProtectedRootNode(node)) {
    return false;
  }
  return isFolderNode(node.parentNodeId ? nodesById[node.parentNodeId] : undefined);
}

function isDescendantOfSource(
  nodeId: string,
  sourceNodeId: string,
  nodesById: WorkspaceState['nodesById']
) {
  const visited = new Set<string>();
  let current = nodesById[nodeId];
  while (current?.parentNodeId && !visited.has(current.parentNodeId)) {
    if (current.parentNodeId === sourceNodeId) {
      return true;
    }
    visited.add(current.parentNodeId);
    current = nodesById[current.parentNodeId];
  }
  return false;
}

function collectSequentialDerivedTopicIds(args: {
  nodeOrder: string[];
  nodesById: WorkspaceState['nodesById'];
  sourceNodeId: string;
}) {
  return args.nodeOrder.filter((nodeId) => {
    const node = args.nodesById[nodeId];
    return Boolean(
      node &&
        nodeId !== args.sourceNodeId &&
        node.kind === 'topic' &&
        hasNodeContent(node) &&
        isReadingReviewItemNode(node) &&
        isDescendantOfSource(nodeId, args.sourceNodeId, args.nodesById)
    );
  });
}

function createReadingWithState(args: {
  defaultPriority: PushQueuePriority;
  node: Node;
  now: string;
  state: NodeReadingProfile['state'];
}) {
  return {
    intervalDurationMs: args.node.reading?.intervalDurationMs ?? 0,
    intervalGrowthFactor: args.node.reading?.intervalGrowthFactor ?? 1,
    lastHandledAt: args.node.reading?.lastHandledAt ?? args.now,
    nextAt: args.node.reading?.nextAt ?? args.now,
    priority: args.node.reading?.priority ?? args.node.priority ?? args.defaultPriority,
    readingPosition: args.node.reading?.readingPosition ?? 0,
    repetitionCount: args.node.reading?.repetitionCount ?? 0,
    state: args.state
  };
}

function applyReadingState(args: {
  changes: SequentialReadingChange[];
  defaultPriority: PushQueuePriority;
  nextNodesById: WorkspaceState['nodesById'];
  nodeId: string;
  now: string;
  state: NodeReadingProfile['state'];
}) {
  const node = args.nextNodesById[args.nodeId];
  if (!node || node.reading?.state === args.state) {
    return;
  }
  const nextReading = createReadingWithState({
    defaultPriority: args.defaultPriority,
    node,
    now: args.now,
    state: args.state
  });
  args.nextNodesById[args.nodeId] = { ...node, reading: nextReading, updatedAt: args.now };
  args.changes.push({
    afterReading: cloneReadingProfile(nextReading),
    beforeReading: cloneReadingProfile(node.reading),
    nodeId: args.nodeId
  });
}

function isPreservedSequentialReadingState(reading: NodeReadingProfile | null | undefined) {
  return reading?.state === 'dismissed' || reading?.state === 'done';
}

export function buildSequentialReadingSourcePatch(args: SequentialReadingArgs & {
  enabled: boolean;
  sourceNodeId: string;
}): SequentialReadingPatch | null {
  const sourceNode = args.nodesById[args.sourceNodeId];
  if (!sourceNode || !isSequentialReadingSourceTopic(sourceNode, args.nodesById)) {
    return null;
  }
  const nextNodesById = { ...args.nodesById };
  const changes: SequentialReadingChange[] = [];
  const nextSource = {
    ...sourceNode,
    sequentialReadingEnabled: args.enabled,
    updatedAt: args.now
  };
  nextNodesById[args.sourceNodeId] = nextSource;
  const derivedNodeIds = collectSequentialDerivedTopicIds(args);
  let released = false;
  for (const nodeId of derivedNodeIds) {
    const node = nextNodesById[nodeId];
    if (!node || isPreservedSequentialReadingState(node.reading)) {
      continue;
    }
    const state = args.enabled ? (released ? 'locked' : 'active') : 'active';
    released ||= args.enabled;
    applyReadingState({
      changes,
      defaultPriority: args.defaultPriority,
      nextNodesById,
      nodeId,
      now: args.now,
      state
    });
  }
  return { changes, nodesById: nextNodesById, sourceNodeId: args.sourceNodeId };
}

export function findEnabledSequentialReadingSourceId(
  nodeId: string,
  nodesById: WorkspaceState['nodesById']
) {
  let current = nodesById[nodeId];
  const visited = new Set<string>();
  while (current?.parentNodeId && !visited.has(current.parentNodeId)) {
    const parent = nodesById[current.parentNodeId];
    if (!parent) {
      break;
    }
    if (isSequentialReadingSourceTopic(parent, nodesById) && parent.sequentialReadingEnabled === true) {
      return parent.id;
    }
    visited.add(current.parentNodeId);
    current = parent;
  }
  return null;
}

export function buildSequentialReadingDismissPatch(args: SequentialReadingArgs & {
  dismissedNodeId: string;
}) {
  const sourceNodeId = findEnabledSequentialReadingSourceId(args.dismissedNodeId, args.nodesById);
  if (!sourceNodeId) {
    return null;
  }
  const nextNodesById = { ...args.nodesById };
  const changes: SequentialReadingChange[] = [];
  const derivedNodeIds = collectSequentialDerivedTopicIds({ ...args, sourceNodeId });
  const startIndex = derivedNodeIds.indexOf(args.dismissedNodeId) + 1;
  for (const nodeId of derivedNodeIds.slice(Math.max(startIndex, 0))) {
    if (nextNodesById[nodeId]?.reading?.state !== 'locked') {
      continue;
    }
    applyReadingState({
      changes,
      defaultPriority: args.defaultPriority,
      nextNodesById,
      nodeId,
      now: args.now,
      state: 'active'
    });
    break;
  }
  return changes.length === 0 ? null : { changes, nodesById: nextNodesById, sourceNodeId };
}

export function findSequentialReadingSourcesForNode(
  nodeId: string,
  nodesById: WorkspaceState['nodesById']
) {
  const sources = new Set<string>();
  const enabledSourceId = findEnabledSequentialReadingSourceId(nodeId, nodesById);
  if (enabledSourceId) {
    sources.add(enabledSourceId);
  }
  const node = nodesById[nodeId];
  if (node && isSequentialReadingSourceTopic(node, nodesById) && node.sequentialReadingEnabled === true) {
    sources.add(nodeId);
  }
  return sources;
}
