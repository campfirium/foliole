import { DAILY_FLOW_NO_OTHER_TOPICS, isDailyFlowNoOtherTopics } from '../../lib/core/flow/dailyFlowSoonOutcome';
import { isReadingReviewItemNode } from '../features/review/model/reviewItemKind';
import { getStoredAppLocale } from '../shared/localization/appLanguage';
import { translate } from '../shared/localization/translations';
import { readWorkspaceOperationLearning } from '../shared/platform/runtime/workspaceOperationLearning';
import { showAppRuntimeNotice } from '../shared/ui/AppRuntimeNotice';

import { prepareWorkspaceFlowDay } from './workspaceFlowDayAction';
import { persistAndApplyReadingReviewPatch } from './workspaceReadingReviewHistoryCommit';
import { buildReviewActiveNodeContext } from './workspaceReviewBrowseRoot';
import { runtimeWorkspaceReviewPersistence } from './workspaceReviewPersistence';
import { createReadingReviewHistoryEntry } from './workspaceStoreReviewActionHelpers';
import type { WorkspaceState } from './workspaceStoreTypes';

type Set = (partial: Partial<WorkspaceState> | ((state: WorkspaceState) => Partial<WorkspaceState>)) => void;

export function createRevisitReviewTopicSoonAction(set: Set, get: () => WorkspaceState): WorkspaceState['revisitReviewTopicSoon'] {
  const pendingNodeIds = new Set<string>();
  return async (now = new Date().toISOString()) => {
    if (!await prepareWorkspaceFlowDay(set, get, now)) return false;
    const snapshot = get();
    const currentNodeId = snapshot.reviewSession.currentNodeId;
    if (!currentNodeId || snapshot.activeNodeId !== currentNodeId || pendingNodeIds.has(currentNodeId) ||
      !isReadingReviewItemNode(snapshot.nodesById[currentNodeId])) return false;
    return persistAndApplyReadingReviewPatch({ currentNodeId, get, set, pendingNodeIds,
      persistence: runtimeWorkspaceReviewPersistence, buildPatch: async state => {
        const nodesById = await readWorkspaceOperationLearning(state.nodesById, [currentNodeId], state.libraryScope ?? state.reviewSession.daily?.scope);
        const node = nodesById?.[currentNodeId];
        if (!node) return null;
        const reviewSession = snapshot.reviewSession;
        const active = buildReviewActiveNodeContext(state, reviewSession.currentNodeId ?? reviewSession.continueNodeId ?? null);
        const historyEntry = createReadingReviewHistoryEntry({ afterActiveNodeId: active.activeNodeId,
          ...('browseRootNodeId' in active ? { afterBrowseRootNodeId: active.browseRootNodeId } : {}),
          afterReading: node.reading, afterReviewSession: reviewSession, beforeReading: node.reading,
          beforeReviewSession: snapshot.reviewSession, mutationTimestamp: now, nodeId: currentNodeId,
          state, title: 'Soon Topic' });
        return { historyEntry, nextNodesForSync: [], patch: { ...active, reviewSession } };
      } }).then(Boolean, error => {
        if (!isDailyFlowNoOtherTopics(error)) throw error;
        if (get().reviewSession === snapshot.reviewSession) {
          showAppRuntimeNotice(translate(getStoredAppLocale(), 'shared.flow.soonNoOtherTopics'), 'info');
        }
        return DAILY_FLOW_NO_OTHER_TOPICS;
      });
  };
}
