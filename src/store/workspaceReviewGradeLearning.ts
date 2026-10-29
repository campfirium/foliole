import { dailyFlowOperationId, readPendingDailyFlowRetry } from '../../lib/core/flow/dailyFlowRetry';
import type { ReviewGrade } from '../features/review/model/reviewTypes';
import { readWorkspaceOperationLearning } from '../shared/platform/runtime/workspaceOperationLearning';

import type { WorkspaceState } from './workspaceStoreTypes';

export async function readWorkspaceGradeLearning(state: WorkspaceState, nodeId: string, grade: ReviewGrade) {
  const nodesById = await readWorkspaceOperationLearning(state.nodesById, [nodeId],
    state.libraryScope ?? state.reviewSession.daily?.scope);
  if (!nodesById) return null;
  // An unacknowledged grade must retain its original facts even if its write succeeded.
  const retry = state.reviewSession.daily
    ? readPendingDailyFlowRetry(dailyFlowOperationId(state.reviewSession.daily, nodeId, `grade:${grade}`)) : undefined;
  return { ...state, nodesById: retry?.grade ? { ...nodesById,
    [nodeId]: { ...nodesById[nodeId]!, review: retry.grade.before } } : nodesById };
}
