import type { Dispatch, SetStateAction } from 'react';

import { handleCompanionPagedTap, isPagedReadingInteraction } from './companionPagedReading';
import { useCompanionTouchClick } from './useCompanionTouchClick';

export function useImmersiveReadingSurfaceTap(editing: boolean, setVisible: Dispatch<SetStateAction<boolean>>) {
  const handlers = useCompanionTouchClick((event) => {
    if (!handleCompanionPagedTap(event)) setVisible((visible) => !visible);
  }, {
    disabled: editing,
    ignoreTarget: isPagedReadingInteraction,
    preserveSelection: true
  });
  return {
    handleSurfaceClick: handlers.onClick,
    handleSurfacePointerDown: handlers.onPointerDown,
    handleSurfacePointerMove: handlers.onPointerMove,
    handleSurfacePointerUp: handlers.onPointerUp,
    handleSurfacePointerCancel: handlers.onPointerCancel
  };
}
