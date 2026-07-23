import { hasNodeContent, type Node, type NodeReadingProfile } from '../features/nodes/model/nodeTypes';
import { isReadingReviewItemNode } from '../features/review/model/reviewItemKind';
import type { PushQueuePriority } from '../features/review/model/unifiedPushQueueRules';

import { cloneReadingProfile } from './workspaceActionHistoryReading';
import {
  isUnavailableSequentialTopic,
  unavailableFolderTopicOccupiesSlot
} from './workspaceSequentialReadingSlotOccupancy';
import { collectFolderSequentialTopicIds } from './workspaceSequentialReadingSourceOrder';
import {
  isSequentialReadingSourceFolder,
  isSequentialReadingSourceNode,
  isSequentialReadingSourceTopic
} from './workspaceSequentialReadingSources';
import type { WorkspaceState } from './workspaceStore';

export { isSequentialReadingSourceFolder, isSequentialReadingSourceTopic };

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
  const sourceNode = args.nodesById[args.sourceNodeId];
  if (isSequentialReadingSourceFolder(sourceNode)) {
    return collectFolderSequentialTopicIds({
      nodesById: args.nodesById,
      sourceNodeId: args.sourceNodeId
    });
  }
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
  args.nextNodesById[args.nodeId] = { ...node, reading: nextReading };
  args.changes.push({
    afterReading: cloneReadingProfile(nextReading),
    beforeReading: cloneReadingProfile(node.reading),
    nodeId: args.nodeId
  });
}

export function buildSequentialReadingSourcePatch(args: SequentialReadingArgs & {
  enabled: boolean;
  sourceNodeId: string;
}): SequentialReadingPatch | null {
  const sourceNode = args.nodesById[args.sourceNodeId];
  if (!sourceNode || !isSequentialReadingSourceNode(sourceNode, args.nodesById)) {
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
    if (isUnavailableSequentialTopic(node)) {
      released ||= args.enabled && unavailableFolderTopicOccupiesSlot({ ...args, nodeId, sourceNode });
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
    if (isSequentialReadingSourceNode(parent, nodesById) && parent.sequentialReadingEnabled === true) {
      return parent.id;
    }
    visited.add(current.parentNodeId);
    current = parent;
  }
  return null;
}

function buildSequentialReadingAdvancePatch(args: SequentialReadingArgs & {
  handledNodeId: string;
}) {
  const sourceNodeId = findEnabledSequentialReadingSourceId(args.handledNodeId, args.nodesById);
  if (!sourceNodeId) {
    return null;
  }
  const nextNodesById = { ...args.nodesById };
  const changes: SequentialReadingChange[] = [];
  const derivedNodeIds = collectSequentialDerivedTopicIds({ ...args, sourceNodeId });
  const sourceNode = nextNodesById[sourceNodeId];
  let released = false;
  let passedHandledNode = false;
  for (const nodeId of derivedNodeIds) {
    const node = nextNodesById[nodeId];
    if (nodeId === args.handledNodeId) {
      released ||= isUnavailableSequentialTopic(node) && unavailableFolderTopicOccupiesSlot({ ...args, nodeId, sourceNode });
      passedHandledNode = true;
      continue;
    }
    if (!passedHandledNode) {
      continue;
    }
    if (isUnavailableSequentialTopic(node)) {
      released ||= unavailableFolderTopicOccupiesSlot({ ...args, nodeId, sourceNode });
      continue;
    }
    const state = released ? 'locked' : 'active';
    released = true;
    applyReadingState({
      changes,
      defaultPriority: args.defaultPriority,
      nextNodesById,
      nodeId,
      now: args.now,
      state
    });
  }
  return changes.length === 0 ? null : { changes, nodesById: nextNodesById, sourceNodeId };
}

export function buildSequentialReadingDismissPatch(args: SequentialReadingArgs & {
  dismissedNodeId: string;
}) {
  return buildSequentialReadingAdvancePatch({ ...args, handledNodeId: args.dismissedNodeId });
}

export function buildSequentialReadingReadPatch(args: SequentialReadingArgs & {
  readNodeId: string;
}) {
  return buildSequentialReadingAdvancePatch({ ...args, handledNodeId: args.readNodeId });
}
