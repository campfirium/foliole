import {
  isUnavailableSequentialTopic,
  unavailableFolderTopicOccupiesSlot
} from './sequentialReadingSlotOccupancy.js';
import { collectSequentialDerivedTopicIds } from './sequentialReadingSourceOrder.js';
import {
  isSequentialReadingSourceFolder,
  isSequentialReadingSourceNode,
  isSequentialReadingSourceTopic
} from './sequentialReadingSources.js';
import { planSequentialReadingSourceStates } from './sequentialReadingSourceStates.js';
import type { SequentialReadingNode as Node, SequentialReadingProfile as NodeReadingProfile, SequentialReadingNodes, SequentialReadingArgs, SequentialReadingPatch, SequentialReadingChange } from './sequentialReadingTypes.js';


const cloneReadingProfile = (reading: NodeReadingProfile | null | undefined) => reading ? { ...reading } : null;

export { isSequentialReadingSourceFolder, isSequentialReadingSourceTopic };

export type { SequentialReadingChange } from './sequentialReadingTypes.js';

function createReadingWithState(args: {
  defaultPriority: SequentialReadingArgs['defaultPriority'];
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
  defaultPriority: SequentialReadingArgs['defaultPriority'];
  nextNodesById: SequentialReadingNodes;
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

export function buildSequentialReadingSourcePatch<T extends Node>(args: SequentialReadingArgs<T> & {
  enabled: boolean;
  sourceNodeId: string;
}): SequentialReadingPatch<T> | null {
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
  const plan = planSequentialReadingSourceStates(args)!;
  for (const change of plan.changes) applyReadingState({
    changes, defaultPriority: args.defaultPriority, nextNodesById,
    nodeId: change.nodeId, now: args.now, state: change.after
  });
  return { changes, nodesById: nextNodesById, sourceNodeId: args.sourceNodeId };
}

export function findEnabledSequentialReadingSourceId(
  nodeId: string,
  nodesById: SequentialReadingNodes
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

function buildSequentialReadingAdvancePatch<T extends Node>(args: SequentialReadingArgs<T> & {
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

export function buildSequentialReadingDismissPatch<T extends Node>(args: SequentialReadingArgs<T> & {
  dismissedNodeId: string;
}) {
  return buildSequentialReadingAdvancePatch({ ...args, handledNodeId: args.dismissedNodeId });
}

export function buildSequentialReadingReadPatch<T extends Node>(args: SequentialReadingArgs<T> & {
  readNodeId: string;
}) {
  return buildSequentialReadingAdvancePatch({ ...args, handledNodeId: args.readNodeId });
}
