import type { Dispatch, SetStateAction } from 'react';

import { isCompanionArticleInteractiveTarget } from './companionSelectionToolbarDom';
import { useCompanionTouchClick } from './useCompanionTouchClick';

export function useImmersiveReadingSurfaceTap(editing: boolean, setVisible: Dispatch<SetStateAction<boolean>>) {
  const handlers = useCompanionTouchClick(() => setVisible((visible) => !visible), {
    disabled: editing, ignoreTarget: isCompanionArticleInteractiveTarget, preserveSelection: true
  });
  return {
    handleSurfaceClick: handlers.onClick,
    handleSurfacePointerDown: handlers.onPointerDown,
    handleSurfacePointerMove: handlers.onPointerMove,
    handleSurfacePointerUp: handlers.onPointerUp,
    handleSurfacePointerCancel: handlers.onPointerCancel
  };
}
