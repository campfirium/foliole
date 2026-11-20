import { isUnavailableSequentialTopic, unavailableFolderTopicOccupiesSlot } from './sequentialReadingSlotOccupancy.js';
import { collectSequentialDerivedTopicIds } from './sequentialReadingSourceOrder.js';
import { findEnabledSequentialReadingSourceId } from './sequentialReadingSources.js';
import type { SequentialReadingStateChange } from './sequentialReadingSourceStates.js';
import { sequentialReadingState, type SequentialReadingStateNodes } from './sequentialReadingState.js';

export function planSequentialReadingAdvanceStates(args: {
  handledNodeId: string; nodeOrder: string[]; nodesById: SequentialReadingStateNodes;
  trashedNodeIds?: readonly string[] | undefined;
}) {
  const sourceNodeId = findEnabledSequentialReadingSourceId(args.handledNodeId, args.nodesById);
  if (!sourceNodeId) return null;
  const sourceNode = args.nodesById[sourceNodeId];
  const changes: SequentialReadingStateChange[] = [];
  let released = false;
  let passedHandledNode = false;
  // A trashed topic keeps its parent for restore, but it neither holds a slot nor receives a new state.
  const trashed = new Set(args.trashedNodeIds ?? []);
  for (const nodeId of collectSequentialDerivedTopicIds({ ...args, sourceNodeId })) {
    if (trashed.has(nodeId)) continue;
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
