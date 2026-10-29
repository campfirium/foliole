import { planSequentialReadingAdvanceStates } from '../../lib/core/review/sequentialReadingAdvanceStates';
import type { SequentialReadingStateNodes } from '../../lib/core/review/sequentialReadingState';
import { readWorkspaceOperationLearning } from '../shared/platform/runtime/workspaceOperationLearning';

import type { ReadingReviewDomainAction } from './workspaceReadingReviewDomain';
import type { WorkspaceState } from './workspaceStoreTypes';

export function readWorkspaceReadingActionLearning(state: WorkspaceState, nodeId: string,
  action: ReadingReviewDomainAction, releaseSequentialReading = false) {
  const node = state.nodesById[nodeId];
  const nodesById: SequentialReadingStateNodes = action === 'dismiss' && node
    ? { ...state.nodesById, [nodeId]: { ...node, reading: { state: 'dismissed' } } } : state.nodesById;
  const plan = action === 'dismiss' || (action === 'read' && releaseSequentialReading)
    ? planSequentialReadingAdvanceStates({ handledNodeId: nodeId, nodeOrder: state.nodeOrder, nodesById }) : null;
  return readWorkspaceOperationLearning(state.nodesById, [nodeId, ...(plan?.changes ?? []).map(value => value.nodeId)],
    state.libraryScope ?? state.reviewSession.daily?.scope);
}
