import { useEffect, useRef } from 'react';

import { isWorkspaceEmptyForGuidedSample } from '../../features/guidedSample/model/guidedSampleWorkspace';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { openGuidedSampleCommand, type OpenGuidedSampleCommandActions } from './openGuidedSampleCommand';

export function useGuidedSampleAutoOpen(
  isWorkspaceHydrated: boolean,
  actions: Pick<OpenGuidedSampleCommandActions, 'openNotesView' | 'startStudyMode'>
) {
  const attemptedRef = useRef(false);

  useEffect(() => {
    if (!isWorkspaceHydrated || attemptedRef.current) {
      return;
    }
    if (!isWorkspaceEmptyForGuidedSample(useWorkspaceStore.getState())) {
      return;
    }
    attemptedRef.current = true;
    void openGuidedSampleCommand({
      closeTrashView: actions.openNotesView,
      openNotesView: actions.openNotesView,
      startReviewSession: useWorkspaceStore.getState().startReviewSession,
      startStudyMode: actions.startStudyMode
    });
  }, [actions, isWorkspaceHydrated]);
}
