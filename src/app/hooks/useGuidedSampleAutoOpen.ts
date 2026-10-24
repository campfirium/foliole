import { useEffect, useRef } from 'react';

import { consumeGuidedSampleStartup } from '../../shared/platform/desktop/guidedSampleStartupRuntime';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { openSeededGuidedSample, type OpenGuidedSampleCommandActions } from './openGuidedSampleCommand';

/** The host seeds the sample when it creates a library; the first startup opens it in Flow. */
export function useGuidedSampleAutoOpen(
  isWorkspaceHydrated: boolean,
  actions: Pick<OpenGuidedSampleCommandActions, 'openNotesView' | 'startStudyMode'>
) {
  const attemptedRef = useRef(false);

  useEffect(() => {
    if (!isWorkspaceHydrated || attemptedRef.current) return;
    attemptedRef.current = true;
    void consumeGuidedSampleStartup().then((rootNodeId) => {
      if (!rootNodeId) return false;
      return openSeededGuidedSample({
        closeTrashView: actions.openNotesView,
        openNotesView: actions.openNotesView,
        startReviewSession: useWorkspaceStore.getState().startReviewSession,
        startStudyMode: actions.startStudyMode
      }, rootNodeId);
    });
  }, [actions, isWorkspaceHydrated]);
}
