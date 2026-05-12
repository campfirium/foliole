import { useCallback, useState } from 'react';

import type { CurrentViewTopicSnapshot } from '../currentViewTopicSnapshot';

export function useMoveToNodeSourceState(setPaletteOpen: (open: boolean) => void) {
  const [moveToNodeSourceSnapshot, setMoveToNodeSourceSnapshot] = useState<CurrentViewTopicSnapshot[] | null>(null);

  const closeMoveToNodePalette = useCallback(() => {
    setMoveToNodeSourceSnapshot(null);
    setPaletteOpen(false);
  }, [setPaletteOpen]);

  const openMoveToNodePalette = useCallback((sourceSnapshot?: CurrentViewTopicSnapshot[]) => {
    setMoveToNodeSourceSnapshot(sourceSnapshot ?? null);
    setPaletteOpen(true);
  }, [setPaletteOpen]);

  const setIsMoveToNodePaletteOpen = useCallback((open: boolean) => {
    if (open) {
      openMoveToNodePalette();
      return;
    }
    closeMoveToNodePalette();
  }, [closeMoveToNodePalette, openMoveToNodePalette]);

  return {
    closeMoveToNodePalette,
    moveToNodeSourceSnapshot,
    openMoveToNodePalette,
    setIsMoveToNodePaletteOpen
  };
}
