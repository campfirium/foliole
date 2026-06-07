import { useEffect, type MutableRefObject } from 'react';

import { onWindowEscape } from '../../shared/platform/keyboard';

import { blurActiveKeyboardTarget, isEditableKeyboardTarget } from './workspaceKeyboardTarget';

interface ReviewEditingEscapeHandlerArgs {
  isCommandPaletteOpen: boolean;
  isSearchPaletteOpen: boolean;
  isSettingsOpen: boolean;
  isStudyMode: boolean;
}

export function useReviewEditingEscapeHandler(
  args: ReviewEditingEscapeHandlerArgs,
  reviewEditingContextRef: MutableRefObject<boolean>,
  setIsReviewEditing: (value: boolean) => void
) {
  useEffect(() => {
    if (!args.isStudyMode || args.isCommandPaletteOpen || args.isSearchPaletteOpen || args.isSettingsOpen) {
      return undefined;
    }
    const exitEditing = () => {
      blurActiveKeyboardTarget();
      reviewEditingContextRef.current = false;
      setIsReviewEditing(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }
      if (!reviewEditingContextRef.current && !isEditableKeyboardTarget(document.activeElement)) {
        return false;
      }
      exitEditing();
    };
    const unlistenEscape = onWindowEscape(handleEscape);
    return () => unlistenEscape();
  }, [args.isCommandPaletteOpen, args.isSearchPaletteOpen, args.isSettingsOpen, args.isStudyMode, reviewEditingContextRef, setIsReviewEditing]);
}
