import { useEffect, useRef, type MutableRefObject } from 'react';

import type { Node } from '../../features/nodes/model/nodeTypes';
import type { CommandShortcutSet } from '../../shared/commands/types';
import { onWindowKeydown } from '../../shared/platform/keyboard';

import { tryRunDeleteSourceTopicShortcut, tryRunReviewNavigation, tryRunShortcut } from './reviewKeyboardNavigation';
import { useReviewEditingEscapeHandler } from './useReviewEditingEscapeHandler';
import { keepReviewNavigationInHotkeyMode, useReviewEditingState } from './useReviewNavigationHotkeyMode';
import { isEditableKeyboardTarget } from './workspaceKeyboardTarget';

interface UseReviewKeyboardShortcutsArgs {
  isStudyMode: boolean;
  isCommandPaletteOpen: boolean;
  isSearchPaletteOpen: boolean;
  isSettingsOpen: boolean;
  activeNodeId: string | null;
  nodeOrder: string[];
  nodesById: Record<string, Node>;
  trashedNodeIds: string[];
  reviewCurrentNodeId: string | null;
  isCurrentReviewItemVisible: boolean;
  isAnswerRevealed: boolean;
  isCurrentItemGradable: boolean;
  revealAnswerShortcuts: CommandShortcutSet | undefined;
  gradeAgainShortcuts: CommandShortcutSet | undefined;
  gradeHardShortcuts: CommandShortcutSet | undefined;
  gradeGoodShortcuts: CommandShortcutSet | undefined;
  gradeEasyShortcuts: CommandShortcutSet | undefined;
  readingSoonShortcuts: CommandShortcutSet | undefined;
  readingLaterShortcuts: CommandShortcutSet | undefined;
  readingReadShortcuts: CommandShortcutSet | undefined;
  readingDismissShortcuts: CommandShortcutSet | undefined;
  deleteCurrentItemShortcuts: CommandShortcutSet | undefined;
  navigateParentShortcuts: CommandShortcutSet | undefined;
  navigateBackShortcuts: CommandShortcutSet | undefined;
  navigateForwardShortcuts: CommandShortcutSet | undefined;
  navigateDownShortcuts: CommandShortcutSet | undefined;
  navigatePreviousSiblingShortcuts: CommandShortcutSet | undefined;
  navigateNextSiblingShortcuts: CommandShortcutSet | undefined;
  deleteSourceTopicShortcuts: CommandShortcutSet | undefined;
  isSourceTopicDeleteDialogOpen: boolean;
  readReviewTopic: () => Promise<boolean>;
  postponeReviewTopic: () => Promise<boolean>;
  deleteCurrentReviewItem: () => boolean;
  deleteReviewSourceTopic: (nodeId: string) => boolean;
  dismissReviewTopic: () => Promise<boolean>;
  revisitReviewTopicSoon: () => Promise<boolean>;
  goBack: () => void;
  goForward: () => void;
  goParent: () => void;
  resumeReviewItem: () => void;
  revealReviewAnswer: () => void;
  selectNode: (nodeId: string) => void;
  gradeReviewCard: (grade: 1 | 2 | 3 | 4) => Promise<boolean>;
}

export function useReviewKeyboardShortcuts(args: UseReviewKeyboardShortcutsArgs) {
  const reviewEditingContextRef = useRef(false);
  const navigationHotkeyModeRef = useRef(false);
  const [isReviewEditing, setIsReviewEditing] = useReviewEditingState({
    isStudyMode: args.isStudyMode,
    navigationHotkeyModeRef,
    reviewEditingContextRef
  });
  const lastChildByParentIdRef = useReviewParentReturnMemory(args.isStudyMode);
  useReviewEditingEscapeHandler(args, reviewEditingContextRef, setIsReviewEditing);
  useReviewHotkeyHandler(args, reviewEditingContextRef, navigationHotkeyModeRef, setIsReviewEditing, lastChildByParentIdRef);
  return isReviewEditing;
}

function useReviewParentReturnMemory(isStudyMode: boolean) {
  const ref = useRef<Record<string, string>>({});
  useEffect(() => {
    if (!isStudyMode) {
      ref.current = {};
    }
  }, [isStudyMode]);
  return ref;
}

function useReviewHotkeyHandler(
  args: UseReviewKeyboardShortcutsArgs,
  reviewEditingContextRef: MutableRefObject<boolean>,
  navigationHotkeyModeRef: MutableRefObject<boolean>,
  setIsReviewEditing: (value: boolean) => void,
  lastChildByParentIdRef: MutableRefObject<Record<string, string>>
) {
  useEffect(
    () =>
      onWindowKeydown((event) =>
        handleReviewKeydown(event, args, reviewEditingContextRef, navigationHotkeyModeRef, setIsReviewEditing, lastChildByParentIdRef)
      ),
    [args, reviewEditingContextRef, navigationHotkeyModeRef, setIsReviewEditing, lastChildByParentIdRef]
  );
}

function handleReviewKeydown(
  event: KeyboardEvent,
  args: UseReviewKeyboardShortcutsArgs,
  reviewEditingContextRef: MutableRefObject<boolean>,
  navigationHotkeyModeRef: MutableRefObject<boolean>,
  setIsReviewEditing: (value: boolean) => void,
  lastChildByParentIdRef: MutableRefObject<Record<string, string>>
) {
  if (!args.isStudyMode || args.isCommandPaletteOpen || args.isSearchPaletteOpen || args.isSettingsOpen) {
    return;
  }
  if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.isComposing || event.repeat) {
    return;
  }
  const isTargetEditing =
    isEditableKeyboardTarget(event.target) ||
    isEditableKeyboardTarget(document.activeElement) ||
    reviewEditingContextRef.current;
  if (isTargetEditing) {
    return;
  }
  if (event.altKey) {
    tryRunDeleteSourceTopicShortcut(event, args);
    return;
  }
  if (tryRunReviewNavigation(event, args, lastChildByParentIdRef)) {
    keepReviewNavigationInHotkeyMode({
      navigationHotkeyModeRef,
      reviewEditingContextRef,
      setIsReviewEditing
    });
    return;
  }
  if (!args.reviewCurrentNodeId || !args.isCurrentReviewItemVisible) {
    handleHiddenReviewItemKeydown(event, args);
    return;
  }
  handleVisibleReviewItemKeydown(event, args);
}
function handleHiddenReviewItemKeydown(event: KeyboardEvent, args: UseReviewKeyboardShortcutsArgs) {
  if (!args.reviewCurrentNodeId || args.isCurrentReviewItemVisible) {
    return;
  }
  if (tryRunShortcut(event, args.deleteCurrentItemShortcuts, args.deleteCurrentReviewItem)) {
    return;
  }
  tryRunShortcut(event, args.readingReadShortcuts, args.resumeReviewItem);
}

function handleVisibleReviewItemKeydown(event: KeyboardEvent, args: UseReviewKeyboardShortcutsArgs) {
  if (tryRunShortcut(event, args.deleteCurrentItemShortcuts, args.deleteCurrentReviewItem)) {
    return;
  }

  if (!args.isCurrentItemGradable) {
    if (tryRunShortcut(event, args.readingSoonShortcuts, () => void args.revisitReviewTopicSoon())) {
      return;
    }
    if (tryRunShortcut(event, args.readingLaterShortcuts, () => void args.postponeReviewTopic())) {
      return;
    }
    if (tryRunShortcut(event, args.readingReadShortcuts, () => void args.readReviewTopic())) {
      return;
    }
    tryRunShortcut(event, args.readingDismissShortcuts, () => void args.dismissReviewTopic());
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
