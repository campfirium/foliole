import { APP_COMMAND_IDS } from '../../shared/commands/ids';

import type { useWorkspaceControllerState, useWorkspaceSelectors } from './appControllerState';
import { useCommandShortcutState } from './reviewHotkeysState';
import { useReviewKeyboardShortcuts } from './useReviewKeyboardShortcuts';

export function useReviewEditingState(args: {
  isExternalViewOpen: boolean;
  hotkeys: ReturnType<typeof useCommandShortcutState>;
  isCurrentReviewItemGradable: boolean;
  isStudyMode: boolean;
  isVirtualViewOpen: boolean;
  runtime: ReturnType<typeof useWorkspaceControllerState>['runtime'];
  ws: ReturnType<typeof useWorkspaceSelectors>;
}) {
  return useReviewKeyboardShortcuts({
    isStudyMode: args.isStudyMode,
    isCommandPaletteOpen: args.runtime.isCommandPaletteOpen,
    isSearchPaletteOpen: args.runtime.isSearchPaletteOpen,
    isSettingsOpen: args.runtime.isSettingsOpen,
    reviewCurrentNodeId: args.ws.reviewSession.currentNodeId,
    isCurrentReviewItemVisible: Boolean(
      args.ws.reviewSession.currentNodeId &&
        args.ws.activeNodeId === args.ws.reviewSession.currentNodeId &&
        !args.isExternalViewOpen &&
        !args.isVirtualViewOpen &&
        !args.runtime.isViewingTrashNode
    ),
    isAnswerRevealed: args.ws.reviewSession.isAnswerRevealed,
    isCurrentItemGradable: args.isCurrentReviewItemGradable,
    revealAnswerShortcuts: args.hotkeys.shortcutMap[APP_COMMAND_IDS.revealReviewAnswer],
    gradeAgainShortcuts: args.hotkeys.shortcutMap[APP_COMMAND_IDS.gradeReviewAgain],
    gradeHardShortcuts: args.hotkeys.shortcutMap[APP_COMMAND_IDS.gradeReviewHard],
    gradeGoodShortcuts: args.hotkeys.shortcutMap[APP_COMMAND_IDS.gradeReviewGood],
    gradeEasyShortcuts: args.hotkeys.shortcutMap[APP_COMMAND_IDS.gradeReviewEasy],
    readingLaterShortcuts: args.hotkeys.shortcutMap[APP_COMMAND_IDS.readingReviewLater],
    readingReadShortcuts: args.hotkeys.shortcutMap[APP_COMMAND_IDS.readingReviewRead],
    readingDismissShortcuts: args.hotkeys.shortcutMap[APP_COMMAND_IDS.readingReviewDismiss],
    completeReviewItem: args.ws.completeReviewItem,
    deferReviewItem: args.ws.deferReviewItem,
    dismissReviewItem: args.ws.dismissReviewItem,
    revealReviewAnswer: args.ws.revealReviewAnswer,
    gradeReviewCard: args.ws.gradeReviewCard
  });
}
