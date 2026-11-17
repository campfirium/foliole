import type { Dispatch, PointerEvent, SetStateAction } from 'react';

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
    handleSurfacePointerUp(event: PointerEvent<HTMLElement>) {
      if (event.defaultPrevented) handlers.onPointerCancel();
      else handlers.onPointerUp(event);
    },
    handleSurfacePointerCancel: handlers.onPointerCancel
  };
}
