import { useEffect, useState } from 'react';

import type { StartStudyModeOptions } from './reviewModeSessionActions';

interface UseStudyModeOptions {
  activeNodeId: string | null;
  isViewingTrashNode: boolean;
}

export function useStudyMode({ activeNodeId, isViewingTrashNode }: UseStudyModeOptions) {
  const [isStudyMode, setIsStudyMode] = useState(false);
  const canStartStudyMode = Boolean(activeNodeId) && !isViewingTrashNode;

  const startStudyMode = (options?: StartStudyModeOptions) => {
    if (!canStartStudyMode && !options?.force) {
      return;
    }
    setIsStudyMode(true);
  };

  const exitStudyMode = () => {
    setIsStudyMode(false);
  };

  useEffect(() => {
    if (isViewingTrashNode && isStudyMode) {
      setIsStudyMode(false);
    }
  }, [isStudyMode, isViewingTrashNode]);

  return {
    canStartStudyMode,
    exitStudyMode,
    isStudyMode,
    resetStudyMode: exitStudyMode,
    startStudyMode
  };
}
