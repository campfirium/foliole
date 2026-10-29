import { planSequentialReadingAdvanceStates } from './sequentialReadingAdvanceStates.js';
import {
  isSequentialReadingSourceNode
} from './sequentialReadingSources.js';
import { planSequentialReadingSourceStates } from './sequentialReadingSourceStates.js';
import type { SequentialReadingNode as Node, SequentialReadingProfile as NodeReadingProfile, SequentialReadingNodes, SequentialReadingArgs, SequentialReadingPatch, SequentialReadingChange } from './sequentialReadingTypes.js';


const cloneReadingProfile = (reading: NodeReadingProfile | null | undefined) => reading ? { ...reading } : null;

export { isSequentialReadingSourceFolder, isSequentialReadingSourceTopic, findEnabledSequentialReadingSourceId } from './sequentialReadingSources.js';

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

function buildSequentialReadingAdvancePatch<T extends Node>(args: SequentialReadingArgs<T> & {
  handledNodeId: string;
}) {
  const plan = planSequentialReadingAdvanceStates(args);
  if (!plan?.changes.length) return null;
  const nextNodesById = { ...args.nodesById };
  const changes: SequentialReadingChange[] = [];
  for (const change of plan.changes) applyReadingState({
    changes, defaultPriority: args.defaultPriority, nextNodesById,
    nodeId: change.nodeId, now: args.now, state: change.after
  });
  return { changes, nodesById: nextNodesById, sourceNodeId: plan.sourceNodeId };
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
