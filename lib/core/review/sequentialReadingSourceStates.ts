import { isUnavailableSequentialTopic, unavailableFolderTopicOccupiesSlot } from './sequentialReadingSlotOccupancy.js';
import { collectSequentialDerivedTopicIds } from './sequentialReadingSourceOrder.js';
import { isSequentialReadingSourceNode } from './sequentialReadingSources.js';
import { sequentialReadingState, type SequentialReadingStateNodes } from './sequentialReadingState.js';

export interface SequentialReadingStateChange {
  nodeId: string;
  before: ReturnType<typeof sequentialReadingState>;
  after: 'active' | 'locked';
}

/** Source preferences change reading state; intervals and progress remain database facts. */
export function planSequentialReadingSourceStates(args: {
  enabled: boolean; sourceNodeId: string; nodeOrder: string[]; nodesById: SequentialReadingStateNodes;
}) {
  const sourceNode = args.nodesById[args.sourceNodeId];
  if (!sourceNode || !isSequentialReadingSourceNode(sourceNode, args.nodesById)) return null;
  const changes: SequentialReadingStateChange[] = [];
  let released = false;
  for (const nodeId of collectSequentialDerivedTopicIds(args)) {
    const node = args.nodesById[nodeId];
    if (isUnavailableSequentialTopic(node)) {
      released ||= args.enabled && unavailableFolderTopicOccupiesSlot({ ...args, nodeId, sourceNode });
      continue;
    }
    const after = args.enabled && released ? 'locked' : 'active';
    released ||= args.enabled;
    const before = sequentialReadingState(node);
    if (before !== after) changes.push({ nodeId, before, after });
  }
  return { sourceNodeId: args.sourceNodeId, changes };
}
