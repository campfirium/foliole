import type { Dispatch, SetStateAction } from 'react';

import { isCompanionArticleInteractiveTarget } from './companionSelectionToolbarDom';
import { useCompanionTouchClick } from './useCompanionTouchClick';

export function useImmersiveReadingSurfaceTap(editing: boolean, setVisible: Dispatch<SetStateAction<boolean>>) {
  const handlers = useCompanionTouchClick(() => setVisible((visible) => !visible), {
    disabled: editing,
    ignoreTarget: target => isCompanionArticleInteractiveTarget(target) ||
      (target instanceof Element && Boolean(target.closest('.cm-md-highlight, .cm-md-highlight-overlap, .cm-md-cloze, .cm-md-anchor-overlap'))),
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
