import { ensureGuidedSampleTopicTree } from '../../features/guidedSample/model/guidedSampleWorkspace';
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
  await openWorkspaceNodeWithPreparedDocument(result.rootNodeId, { forceLoad: true });

  if (!result.wasWorkspaceEmpty) {
    actions.openNotesView();
    return true;
  }

  if (startGuidedSampleReviewSession(result.queueNodeIds)) {
    actions.openNotesView();
    actions.startStudyMode({ force: true });
  }
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
