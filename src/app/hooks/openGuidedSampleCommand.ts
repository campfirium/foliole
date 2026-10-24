import {
  collectGuidedSampleQueueNodeIds,
  ensureGuidedSampleTopicTree
} from '../../features/guidedSample/model/guidedSampleWorkspace';
import { openWorkspaceNodeWithPreparedDocument } from '../../store/workspaceNodePreparation';
import { refreshWorkspaceState } from '../../store/workspaceRefreshScheduler';
import { createStartedReviewSession } from '../../store/workspaceReviewReading';
import { useWorkspaceStore } from '../../store/workspaceStore';

import type { StartStudyModeOptions } from './reviewModeSessionActions';

export interface OpenGuidedSampleCommandActions {
  closeTrashView: () => void;
  openNotesView: () => void;
  startReviewSession: () => boolean;
  startStudyMode: (options?: StartStudyModeOptions) => void;
}

function startGuidedSampleReviewSession(queueNodeIds: string[]) {
  if (queueNodeIds.length === 0) {
    return false;
  }
  const now = new Date().toISOString();
  useWorkspaceStore.setState((state) => ({
    activeNodeId: queueNodeIds[0] ?? state.activeNodeId,
    reviewSession: createStartedReviewSession({
      continueNodeId: state.activeNodeId,
      currentNodeId: queueNodeIds[0] ?? null,
      queueNodeIds,
      sessionStartedAt: now,
      totalNodeCount: queueNodeIds.length
    })
  }));
  return true;
}

function startGuidedSampleFlow(actions: OpenGuidedSampleCommandActions, queueNodeIds: string[]) {
  if (startGuidedSampleReviewSession(queueNodeIds)) {
    actions.openNotesView();
    actions.startStudyMode({ force: true });
  }
}

export async function openGuidedSampleCommand(actions: OpenGuidedSampleCommandActions) {
  const result = await ensureGuidedSampleTopicTree(
    () => useWorkspaceStore.getState(),
    undefined,
    { refreshWorkspaceState: () => refreshWorkspaceState('guided-sample') }
  );
  if (!result.rootNodeId) {
    return false;
  }
  actions.closeTrashView();
  const opened = await openWorkspaceNodeWithPreparedDocument(result.rootNodeId, { forceLoad: true });
  if (!opened) return false;

  if (!result.wasWorkspaceEmpty) {
    actions.openNotesView();
    return true;
  }
  startGuidedSampleFlow(actions, result.queueNodeIds);
  return true;
}

/** Opens the sample the host seeded into a new library, unless the user already moved elsewhere. */
export async function openSeededGuidedSample(actions: OpenGuidedSampleCommandActions, rootNodeId: string) {
  const state = useWorkspaceStore.getState();
  if (!state.nodesById[rootNodeId] || state.trashedNodeIds.includes(rootNodeId)) return false;
  const activeBefore = state.activeNodeId;
  const queueNodeIds = collectGuidedSampleQueueNodeIds(state, rootNodeId);
  const mayOpen = () => {
    const active = useWorkspaceStore.getState().activeNodeId;
    return active === null || active === activeBefore || queueNodeIds.includes(active);
  };
  actions.closeTrashView();
  const opened = await openWorkspaceNodeWithPreparedDocument(rootNodeId, { forceLoad: true, shouldApply: mayOpen });
  if (!opened || !mayOpen()) return false;
  startGuidedSampleFlow(actions, queueNodeIds);
  return true;
}

export function createOpenGuidedSampleCommand(
  closeTrashView: () => void,
  openNotesView: () => void,
  startReviewSession: () => boolean,
  startStudyMode: (options?: StartStudyModeOptions) => void
) {
  return () => openGuidedSampleCommand({ closeTrashView, openNotesView, startReviewSession, startStudyMode });
}
