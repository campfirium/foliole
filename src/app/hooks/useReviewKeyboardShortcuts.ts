import { useEffect, useState } from 'react';

import { matchesShortcutSet } from '../../shared/commands/shortcuts';
import type { CommandShortcutSet } from '../../shared/commands/types';
import { onWindowKeydown } from '../../shared/platform/keyboard';

interface UseReviewKeyboardShortcutsArgs {
  isStudyMode: boolean;
  isCommandPaletteOpen: boolean;
  isSettingsOpen: boolean;
  reviewCurrentNodeId: string | null;
  isAnswerRevealed: boolean;
  isCurrentItemGradable: boolean;
  revealAnswerShortcuts: CommandShortcutSet | undefined;
  gradeAgainShortcuts: CommandShortcutSet | undefined;
  gradeHardShortcuts: CommandShortcutSet | undefined;
  gradeGoodShortcuts: CommandShortcutSet | undefined;
  gradeEasyShortcuts: CommandShortcutSet | undefined;
  readingLaterShortcuts: CommandShortcutSet | undefined;
  readingReadShortcuts: CommandShortcutSet | undefined;
  readingDismissShortcuts: CommandShortcutSet | undefined;
  completeReviewItem: () => boolean;
  deferReviewItem: () => boolean;
  dismissReviewItem: () => boolean;
  revealReviewAnswer: () => void;
  gradeReviewCard: (grade: 1 | 2 | 3 | 4) => Promise<boolean>;
}

const NON_TEXT_INPUT_TYPES = new Set(['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit']);

function isEditableElement(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable || target.closest('[contenteditable="true"]')) {
    return true;
  }
  if (target instanceof HTMLTextAreaElement) {
    return !target.readOnly && !target.disabled;
  }
  if (target instanceof HTMLInputElement) {
    return !target.readOnly && !target.disabled && !NON_TEXT_INPUT_TYPES.has(target.type.toLowerCase());
  }
  return false;
}

export function useReviewKeyboardShortcuts(args: UseReviewKeyboardShortcutsArgs) {
  const [isReviewEditing, setIsReviewEditing] = useReviewEditingState(args.isStudyMode);
  useReviewHotkeyHandler(args, isReviewEditing, setIsReviewEditing);
  return isReviewEditing;
}

function useReviewEditingState(isStudyMode: boolean) {
  const [isReviewEditing, setIsReviewEditing] = useState(false);
  useEffect(() => {
    if (!isStudyMode) {
      setIsReviewEditing(false);
      return;
    }
    const syncEditingState = (target: EventTarget | null) => setIsReviewEditing(isEditableElement(target));
    syncEditingState(document.activeElement);
    const handleFocusIn = (event: FocusEvent) => syncEditingState(event.target);
    const handleFocus = (event: FocusEvent) => syncEditingState(event.target);
    window.addEventListener('focusin', handleFocusIn);
    window.addEventListener('focus', handleFocus, true);
    return () => {
      window.removeEventListener('focusin', handleFocusIn);
      window.removeEventListener('focus', handleFocus, true);
    };
  }, [isStudyMode]);
  return [isReviewEditing, setIsReviewEditing] as const;
}

function useReviewHotkeyHandler(
  args: UseReviewKeyboardShortcutsArgs,
  isReviewEditing: boolean,
  setIsReviewEditing: (value: boolean) => void
) {
  useEffect(
    () =>
      onWindowKeydown((event) => handleReviewKeydown(event, args, isReviewEditing, setIsReviewEditing)),
    [args, isReviewEditing, setIsReviewEditing]
  );
}

function tryRunShortcut(
  event: KeyboardEvent,
  shortcuts: CommandShortcutSet | undefined,
  action: () => void | boolean
) {
  if (!matchesShortcutSet(event, shortcuts)) {
    return false;
  }
  event.preventDefault();
  action();
  return true;
}

function handleReviewKeydown(
  event: KeyboardEvent,
  args: UseReviewKeyboardShortcutsArgs,
  isReviewEditing: boolean,
  setIsReviewEditing: (value: boolean) => void
) {
  if (!args.isStudyMode || args.isCommandPaletteOpen || args.isSettingsOpen) {
    return;
  }
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.isComposing || event.repeat) {
    return;
  }
  const isTargetEditing = isEditableElement(event.target) || isEditableElement(document.activeElement) || isReviewEditing;
  if (event.key === 'Escape') {
    if (!isTargetEditing) {
      return;
    }
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setIsReviewEditing(false);
    event.preventDefault();
    return;
  }
  if (isTargetEditing || !args.reviewCurrentNodeId) {
    return;
  }

  if (!args.isCurrentItemGradable) {
    if (tryRunShortcut(event, args.readingLaterShortcuts, args.deferReviewItem)) {
      return;
    }
    if (tryRunShortcut(event, args.readingReadShortcuts, args.completeReviewItem)) {
      return;
    }
    tryRunShortcut(event, args.readingDismissShortcuts, args.dismissReviewItem);
    return;
  }

  if (!args.isAnswerRevealed) {
    tryRunShortcut(event, args.revealAnswerShortcuts, args.revealReviewAnswer);
    return;
  }

  if (tryRunShortcut(event, args.gradeAgainShortcuts, () => void args.gradeReviewCard(1))) {
    return;
  }
  if (tryRunShortcut(event, args.gradeHardShortcuts, () => void args.gradeReviewCard(2))) {
    return;
  }
  if (tryRunShortcut(event, args.gradeGoodShortcuts, () => void args.gradeReviewCard(3))) {
    return;
  }
  tryRunShortcut(event, args.gradeEasyShortcuts, () => void args.gradeReviewCard(4));
}
