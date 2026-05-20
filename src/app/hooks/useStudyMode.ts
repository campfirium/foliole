import { useState } from 'react';

import type { StartStudyModeOptions } from './reviewModeSessionActions';
import {
  isDevReviewStatusBarOpen,
  isDevReviewStatusBarPersistenceEnabled,
  setDevReviewStatusBarOpen,
  setDevReviewStatusBarPersistenceEnabled
} from './studyModeStatusBarPersistence';

interface UseStudyModeOptions {
  activeNodeId: string | null;
  isViewingTrashNode: boolean;
}

export function useStudyMode({ activeNodeId, isViewingTrashNode }: UseStudyModeOptions) {
  const [isDevReviewStatusBarPersistenceEnabledState, setIsDevReviewStatusBarPersistenceEnabledState] = useState(
    () => import.meta.env.DEV && isDevReviewStatusBarPersistenceEnabled()
  );
  const [isStudyMode, setIsStudyMode] = useState(
    () => import.meta.env.DEV && isDevReviewStatusBarPersistenceEnabled() && isDevReviewStatusBarOpen()
  );
  const canStartStudyMode = Boolean(activeNodeId) && !isViewingTrashNode;

  const setStudyMode = (next: boolean) => {
    setIsStudyMode(next);
    if (isDevReviewStatusBarPersistenceEnabledState) {
      setDevReviewStatusBarOpen(next);
    }
  };

  const startStudyMode = (options?: StartStudyModeOptions) => {
    if (!canStartStudyMode && !options?.force) {
      return;
    }
    setStudyMode(true);
  };

  const exitStudyMode = () => {
    setStudyMode(false);
  };

  const toggleDevReviewStatusBarPersistence = () => {
    const next = !isDevReviewStatusBarPersistenceEnabledState;
    setDevReviewStatusBarPersistenceEnabled(next);
    setIsDevReviewStatusBarPersistenceEnabledState(next);
    if (next) {
      setDevReviewStatusBarOpen(isStudyMode);
    }
  };

  return {
    canStartStudyMode,
    exitStudyMode,
    isDevReviewStatusBarPersistenceEnabled: isDevReviewStatusBarPersistenceEnabledState,
    isStudyMode,
    resetStudyMode: exitStudyMode,
    startStudyMode,
    toggleDevReviewStatusBarPersistence
  };
}
