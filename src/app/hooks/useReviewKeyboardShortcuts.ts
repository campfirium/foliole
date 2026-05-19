import { useEffect, useState } from 'react';

import { matchesShortcutSet } from '../../shared/commands/shortcuts';
import type { CommandShortcutSet } from '../../shared/commands/types';
import { onWindowEscape, onWindowKeydown } from '../../shared/platform/keyboard';

import { blurActiveKeyboardTarget, isEditableKeyboardTarget } from './workspaceKeyboardTarget';

interface UseReviewKeyboardShortcutsArgs {
  isStudyMode: boolean;
  isCommandPaletteOpen: boolean;
  isSearchPaletteOpen: boolean;
  isSettingsOpen: boolean;
  reviewCurrentNodeId: string | null;
  isCurrentReviewItemVisible: boolean;
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
  deleteCurrentItemShortcuts: CommandShortcutSet | undefined;
  completeReviewItem: () => boolean;
  deferReviewItem: () => boolean;
  deleteCurrentReviewItem: () => boolean;
  dismissReviewItem: () => boolean;
  resumeReviewItem: () => void;
  revealReviewAnswer: () => void;
  gradeReviewCard: (grade: 1 | 2 | 3 | 4) => Promise<boolean>;
}

export function useReviewKeyboardShortcuts(args: UseReviewKeyboardShortcutsArgs) {
  const [isReviewEditing, setIsReviewEditing] = useReviewEditingState(args.isStudyMode);
  useReviewEditingEscapeHandler(args, isReviewEditing, setIsReviewEditing);
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
    const syncEditingState = (target: EventTarget | null) => setIsReviewEditing(isEditableKeyboardTarget(target));
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

function useReviewEditingEscapeHandler(
  args: UseReviewKeyboardShortcutsArgs,
  isReviewEditing: boolean,
  setIsReviewEditing: (value: boolean) => void
) {
  useEffect(() => {
    if (
      !args.isStudyMode ||
      !isReviewEditing ||
      args.isCommandPaletteOpen ||
      args.isSearchPaletteOpen ||
      args.isSettingsOpen
    ) {
      return undefined;
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }
      blurActiveKeyboardTarget();
      setIsReviewEditing(false);
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener('keydown', handleEscape, true);
    const unlistenFallback = onWindowEscape(handleEscape);
    return () => {
      window.removeEventListener('keydown', handleEscape, true);
      unlistenFallback();
    };
  }, [args.isCommandPaletteOpen, args.isSearchPaletteOpen, args.isSettingsOpen, args.isStudyMode, isReviewEditing, setIsReviewEditing]);
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
  if (!args.isStudyMode || args.isCommandPaletteOpen || args.isSearchPaletteOpen || args.isSettingsOpen) {
    return;
  }
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.isComposing || event.repeat) {
    return;
  }
  const isTargetEditing = isEditableKeyboardTarget(event.target) || isEditableKeyboardTarget(document.activeElement) || isReviewEditing;
  if (event.key === 'Escape') {
    if (!isTargetEditing) {
      return;
    }
    blurActiveKeyboardTarget();
    setIsReviewEditing(false);
    event.preventDefault();
    return;
  }
  if (isTargetEditing || !args.reviewCurrentNodeId || !args.isCurrentReviewItemVisible) {
    if (!isTargetEditing && args.reviewCurrentNodeId && !args.isCurrentReviewItemVisible) {
      const resumeShortcuts = args.isCurrentItemGradable ? args.revealAnswerShortcuts : args.readingReadShortcuts;
      tryRunShortcut(event, resumeShortcuts, args.resumeReviewItem);
    }
    return;
  }

  if (tryRunShortcut(event, args.deleteCurrentItemShortcuts, args.deleteCurrentReviewItem)) {
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
