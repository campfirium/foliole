import { APP_COMMAND_IDS } from '../../shared/commands/ids';

import { resolveReviewDeleteTargetNodeId } from './appControllerPaletteReviewActions';
import type { useWorkspaceControllerState, useWorkspaceSelectors } from './appControllerState';
import { useCommandShortcutState } from './reviewHotkeysState';
import { scrollReviewReadingSurface } from './reviewReadingScrollCommand';
import { useReviewKeyboardShortcuts } from './useReviewKeyboardShortcuts';

type ReviewShortcutMap = ReturnType<typeof useCommandShortcutState>['shortcutMap'];

function buildReviewShortcutBindings(shortcutMap: ReviewShortcutMap) {
  return {
    revealAnswerShortcuts: shortcutMap[APP_COMMAND_IDS.revealReviewAnswer],
    gradeAgainShortcuts: shortcutMap[APP_COMMAND_IDS.gradeReviewAgain],
    gradeHardShortcuts: shortcutMap[APP_COMMAND_IDS.gradeReviewHard],
    gradeGoodShortcuts: shortcutMap[APP_COMMAND_IDS.gradeReviewGood],
    gradeEasyShortcuts: shortcutMap[APP_COMMAND_IDS.gradeReviewEasy],
    readingSoonShortcuts: shortcutMap[APP_COMMAND_IDS.readingReviewSoon],
    readingLaterShortcuts: shortcutMap[APP_COMMAND_IDS.readingReviewLater],
    readingReadShortcuts: shortcutMap[APP_COMMAND_IDS.readingReviewRead],
    readingDismissShortcuts: shortcutMap[APP_COMMAND_IDS.readingReviewDismiss],
    scrollReadingDownShortcuts: shortcutMap[APP_COMMAND_IDS.reviewScrollReadingDown],
    scrollReadingUpShortcuts: shortcutMap[APP_COMMAND_IDS.reviewScrollReadingUp],
    deleteCurrentItemShortcuts: shortcutMap[APP_COMMAND_IDS.deleteCurrentReviewItem],
    navigateParentShortcuts: shortcutMap[APP_COMMAND_IDS.reviewNavigateParent],
    navigateBackShortcuts: shortcutMap[APP_COMMAND_IDS.reviewNavigateBack],
    navigateForwardShortcuts: shortcutMap[APP_COMMAND_IDS.reviewNavigateForward],
    navigateDownShortcuts: shortcutMap[APP_COMMAND_IDS.reviewNavigateDown],
    navigatePreviousSiblingShortcuts: shortcutMap[APP_COMMAND_IDS.reviewNavigatePreviousSibling],
    navigateNextSiblingShortcuts: shortcutMap[APP_COMMAND_IDS.reviewNavigateNextSibling],
    deleteSourceTopicShortcuts: shortcutMap[APP_COMMAND_IDS.deleteReviewSourceTopic]
  };
}

function useReviewEditingState(args: {
  isExternalViewOpen: boolean;
  hotkeys: ReturnType<typeof useCommandShortcutState>;
  isCurrentReviewItemGradable: boolean;
  isSourceTopicDeleteDialogOpen: boolean;
  isStudyMode: boolean;
  isVirtualViewOpen: boolean;
  nav: ReturnType<typeof useWorkspaceControllerState>['nav'];
  nowIso: string;
  onResumeReviewItem: () => void;
  onRequestDeleteSourceTopic: (nodeId: string) => boolean;
  runtime: ReturnType<typeof useWorkspaceControllerState>['runtime'];
  ws: ReturnType<typeof useWorkspaceSelectors>;
}) {
  return useReviewKeyboardShortcuts({
    isStudyMode: args.isStudyMode,
    isImmersiveMode: args.runtime.isImmersiveMode,
    isCommandPaletteOpen: args.runtime.isCommandPaletteOpen,
    isSearchPaletteOpen: args.runtime.isSearchPaletteOpen,
    isSettingsOpen: args.runtime.isSettingsOpen,
    activeNodeId: args.ws.activeNodeId,
    nodeOrder: args.ws.nodeOrder,
    nodesById: args.ws.nodesById,
    trashedNodeIds: args.ws.trashedNodeIds,
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
    ...buildReviewShortcutBindings(args.hotkeys.shortcutMap),
    isSourceTopicDeleteDialogOpen: args.isSourceTopicDeleteDialogOpen,
    readReviewTopic: () => args.ws.readReviewTopic(args.nowIso),
    postponeReviewTopic: () => args.ws.postponeReviewTopic(args.nowIso),
    deleteCurrentReviewItem: () => {
      const nodeId = resolveReviewDeleteTargetNodeId(args.ws);
      if (!nodeId) {
        return false;
      }
      args.ws.deleteNode(nodeId);
      return true;
    },
    deleteReviewSourceTopic: args.onRequestDeleteSourceTopic,
    dismissReviewTopic: () => args.ws.dismissReviewTopic(args.nowIso),
    scrollReviewReadingDown: () => scrollReviewReadingSurface(args.runtime.editorRef.current, 'down'),
    scrollReviewReadingUp: () => scrollReviewReadingSurface(args.runtime.editorRef.current, 'up'),
    goBack: args.nav.handleGoBack,
    goForward: args.nav.handleGoForward,
    goParent: args.nav.handleGoParent,
    resumeReviewItem: args.onResumeReviewItem,
    revealReviewAnswer: args.ws.revealReviewAnswer,
    selectNode: args.nav.handleSelectNode,
    revisitReviewTopicSoon: () => args.ws.revisitReviewTopicSoon(args.nowIso),
    gradeReviewCard: (grade) => args.ws.gradeReviewCard(grade, args.nowIso)
  });
}

export function useAppControllerReviewEditing(args: {
  controller: ReturnType<typeof useWorkspaceControllerState>;
  hotkeys: ReturnType<typeof useCommandShortcutState>;
  isCurrentReviewItemGradable: boolean;
  isStudyMode: boolean;
  nowIso: string;
  resumeReviewItem: () => void;
  reviewSourceTopicDeleteDialog: {
    isOpen: boolean;
    requestDeleteSourceTopic: (nodeId: string) => boolean;
  };
  ws: ReturnType<typeof useWorkspaceSelectors>;
}) {
  return useReviewEditingState({
    hotkeys: args.hotkeys,
    isExternalViewOpen: args.controller.externalView.isExternalViewOpen,
    isCurrentReviewItemGradable: args.isCurrentReviewItemGradable,
    isSourceTopicDeleteDialogOpen: args.reviewSourceTopicDeleteDialog.isOpen,
    isStudyMode: args.isStudyMode,
    isVirtualViewOpen: args.controller.virtualView.isVirtualViewOpen,
    nowIso: args.nowIso,
    onResumeReviewItem: args.resumeReviewItem,
    onRequestDeleteSourceTopic: args.reviewSourceTopicDeleteDialog.requestDeleteSourceTopic,
    runtime: args.controller.runtime,
    nav: args.controller.nav,
    ws: args.ws
  });
}
