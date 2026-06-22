import { useEffect, type MutableRefObject } from 'react';

import { onNativeEditingEscape, onWindowEscape, onWindowPriorityEscape } from '../../shared/platform/keyboard';
import { onReviewEditorEscapeBlur } from '../../shared/platform/reviewEditorEscape';

import { blurActiveKeyboardTarget, isEditableKeyboardTarget } from './workspaceKeyboardTarget';

interface ReviewEditingEscapeHandlerArgs {
  isCommandPaletteOpen: boolean;
  isSearchPaletteOpen: boolean;
  isSettingsOpen: boolean;
  isStudyMode: boolean;
}

function isReviewEditorEscapeTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest('.markdown-editor-host[data-review-escape-blur="true"]'));
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
      const escapeStartedFromEditor = isEditableKeyboardTarget(event.target);
      if (
        !reviewEditingContextRef.current &&
        !isEditableKeyboardTarget(document.activeElement) &&
        !escapeStartedFromEditor
      ) {
        return false;
      }
      exitEditing();
    };
    const handleEditorEscapeCapture = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || document.querySelector('[role="dialog"]')) {
        return false;
      }
      if (!isReviewEditorEscapeTarget(event.target) && !isReviewEditorEscapeTarget(document.activeElement)) {
        return false;
      }
      exitEditing();
      return true;
    };
    const unlistenEditorEscapeCapture = onWindowPriorityEscape(handleEditorEscapeCapture);
    const unlistenEscape = onWindowEscape(handleEscape);
    const unlistenNativeFallback = onNativeEditingEscape({
      exitEditing,
      isDialogOpen: () => Boolean(document.querySelector('[role="dialog"]')),
      isEditing: () => reviewEditingContextRef.current || isEditableKeyboardTarget(document.activeElement)
    });
    const unlistenEditorEscapeBlur = onReviewEditorEscapeBlur(exitEditing);
    return () => {
      unlistenEditorEscapeCapture();
      unlistenEscape();
      unlistenNativeFallback();
      unlistenEditorEscapeBlur();
    };
  }, [args.isCommandPaletteOpen, args.isSearchPaletteOpen, args.isSettingsOpen, args.isStudyMode, reviewEditingContextRef, setIsReviewEditing]);
}
