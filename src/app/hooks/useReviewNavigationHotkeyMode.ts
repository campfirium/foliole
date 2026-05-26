import { useEffect, useState, type MutableRefObject } from 'react';

import { blurActiveKeyboardTarget, isEditableKeyboardTarget } from './workspaceKeyboardTarget';

export function useReviewEditingState(args: {
  isStudyMode: boolean;
  navigationHotkeyModeRef: MutableRefObject<boolean>;
  reviewEditingContextRef: MutableRefObject<boolean>;
}) {
  const [isReviewEditing, setIsReviewEditing] = useState(false);
  useEffect(() => {
    if (!args.isStudyMode) {
      args.reviewEditingContextRef.current = false;
      args.navigationHotkeyModeRef.current = false;
      setIsReviewEditing(false);
      return;
    }
    const syncEditingState = (target: EventTarget | null) => {
      if (target instanceof HTMLElement && target.closest('[role="dialog"]')) return;
      const nextIsEditing = isEditableKeyboardTarget(target);
      if (nextIsEditing && args.navigationHotkeyModeRef.current) {
        blurActiveKeyboardTarget();
        args.reviewEditingContextRef.current = false;
        setIsReviewEditing(false);
        return;
      }
      args.reviewEditingContextRef.current = nextIsEditing;
      setIsReviewEditing(nextIsEditing);
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (isEditableKeyboardTarget(event.target)) args.navigationHotkeyModeRef.current = false;
    };
    syncEditingState(document.activeElement);
    const handleFocusIn = (event: FocusEvent) => syncEditingState(event.target);
    const handleFocus = (event: FocusEvent) => syncEditingState(event.target);
    window.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('focusin', handleFocusIn);
    window.addEventListener('focus', handleFocus, true);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('focusin', handleFocusIn);
      window.removeEventListener('focus', handleFocus, true);
    };
  }, [args]);
  return [isReviewEditing, setIsReviewEditing] as const;
}

export function keepReviewNavigationInHotkeyMode(args: {
  navigationHotkeyModeRef: MutableRefObject<boolean>;
  reviewEditingContextRef: MutableRefObject<boolean>;
  setIsReviewEditing: (value: boolean) => void;
}) {
  const exitNavigationEditing = () => {
    blurActiveKeyboardTarget();
    args.navigationHotkeyModeRef.current = true;
    args.reviewEditingContextRef.current = false;
    args.setIsReviewEditing(false);
  };
  exitNavigationEditing();
  requestAnimationFrame(exitNavigationEditing);
}
