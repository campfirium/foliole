import { useEffect, useState } from 'react';

interface UseStudyModeOptions {
  activeNodeId: string | null;
  isViewingTrashNode: boolean;
}

export function useStudyMode({ activeNodeId, isViewingTrashNode }: UseStudyModeOptions) {
  const [isStudyMode, setIsStudyMode] = useState(false);
  const canStartStudyMode = Boolean(activeNodeId) && !isViewingTrashNode;

  const startStudyMode = () => {
    if (!canStartStudyMode) {
      return;
    }
    setIsStudyMode(true);
  };

  const exitStudyMode = () => {
    setIsStudyMode(false);
  };

  useEffect(() => {
    if (!canStartStudyMode && isStudyMode) {
      setIsStudyMode(false);
    }
  }, [canStartStudyMode, isStudyMode]);

  return {
    canStartStudyMode,
    exitStudyMode,
    isStudyMode,
    resetStudyMode: exitStudyMode,
    startStudyMode
  };
}
