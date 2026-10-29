import { isUnavailableSequentialTopic, unavailableFolderTopicOccupiesSlot } from './sequentialReadingSlotOccupancy.js';
import { collectSequentialDerivedTopicIds } from './sequentialReadingSourceOrder.js';
import { findEnabledSequentialReadingSourceId } from './sequentialReadingSources.js';
import type { SequentialReadingStateChange } from './sequentialReadingSourceStates.js';
import { sequentialReadingState, type SequentialReadingStateNodes } from './sequentialReadingState.js';

export function planSequentialReadingAdvanceStates(args: {
  handledNodeId: string; nodeOrder: string[]; nodesById: SequentialReadingStateNodes;
}) {
  const sourceNodeId = findEnabledSequentialReadingSourceId(args.handledNodeId, args.nodesById);
  if (!sourceNodeId) return null;
  const sourceNode = args.nodesById[sourceNodeId];
  const changes: SequentialReadingStateChange[] = [];
  let released = false;
  let passedHandledNode = false;
  for (const nodeId of collectSequentialDerivedTopicIds({ ...args, sourceNodeId })) {
    const node = args.nodesById[nodeId];
    if (nodeId === args.handledNodeId) {
      released ||= isUnavailableSequentialTopic(node) && unavailableFolderTopicOccupiesSlot({ ...args, nodeId, sourceNode });
      passedHandledNode = true;
      continue;
    }
    if (!passedHandledNode) continue;
    if (isUnavailableSequentialTopic(node)) {
      released ||= unavailableFolderTopicOccupiesSlot({ ...args, nodeId, sourceNode });
      continue;
    }
    const after = released ? 'locked' : 'active';
    released = true;
    const before = sequentialReadingState(node);
    if (before !== after) changes.push({ nodeId, before, after });
  }
  return { sourceNodeId, changes };
}
