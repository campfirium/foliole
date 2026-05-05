import { useMemo } from 'react';

import { getReviewItemKind } from '../../features/review/model/reviewItemKind';
import { getReviewSchedulerSettingsSignature } from '../../features/settings/model/reviewSchedulerSettings';
import { APP_COMMAND_IDS } from '../../shared/commands/ids';
import type { CommandPaletteItem } from '../../shared/commands/types';
import { toggleMainWindowDevTools } from '../../shared/platform/windowControls';
import type { WorkspaceLayoutProps } from '../components/WorkspaceLayout';

import { buildAppPaletteItems } from './appCommands';
import { buildPaletteState, useCurrentReviewPreview } from './appControllerHelpers';
import { buildAppControllerLayoutProps } from './appControllerLayoutProps';
import {
  useAppearanceState,
  useNowIso,
  useWorkspaceControllerState,
  useWorkspaceSelectors
} from './appControllerState';
import { createPaletteCommandRunner } from './appPaletteCommandRunner';
import { countDueReviewNodes } from './layoutPropsBuilder';
import {
  isReviewShortcutCommand,
  mapPaletteItemsToHotkeyItems,
  REVIEW_SHORTCUT_COMMAND_IDS,
  useCommandShortcutState
} from './reviewHotkeysState';
import { useReviewKeyboardShortcuts } from './useReviewKeyboardShortcuts';
import { useReviewSchedulerSettingsState } from './useReviewSchedulerSettingsState';
import { useWorkspaceHydration } from './useWorkspaceHydration';

export interface AppPaletteState {
  isOpen: boolean;
  items: CommandPaletteItem[];
  recentCommandIds: string[];
  onClose: () => void;
  onRunCommand: (id: string) => void;
}

export interface AppControllerResult {
  layoutProps: WorkspaceLayoutProps;
  paletteState: AppPaletteState;
}

function buildControllerPaletteState(args: {
  isStudyMode: boolean;
  layoutProps: WorkspaceLayoutProps;
  nav: ReturnType<typeof useWorkspaceControllerState>['nav'];
  paletteItems: CommandPaletteItem[];
  runtime: ReturnType<typeof useWorkspaceControllerState>['runtime'];
  study: ReturnType<typeof useWorkspaceControllerState>['study'];
  trash: ReturnType<typeof useWorkspaceControllerState>['trash'];
  ws: ReturnType<typeof useWorkspaceSelectors>;
}) {
  const runPaletteCommand = createPaletteCommandRunner({
    closeTrashView: args.trash.closeTrashView,
    completeReviewItem: args.ws.completeReviewItem,
    deferReviewItem: args.ws.deferReviewItem,
    dismissReviewItem: args.ws.dismissReviewItem,
    exitReviewSession: args.ws.exitReviewSession,
    exitStudyMode: args.study.exitStudyMode,
    goBack: args.nav.handleGoBack,
    goForward: args.nav.handleGoForward,
    goParent: args.nav.handleGoParent,
    gradeReviewCard: args.ws.gradeReviewCard,
    isReviewMode: args.isStudyMode,
    onToggleEditorDisplayMode: args.layoutProps.onToggleEditorDisplayMode,
    onToggleListVisibility: args.layoutProps.onToggleListVisibility,
    onToggleDevTools: toggleMainWindowDevTools,
    openTrashView: args.trash.openTrashView,
    paletteItems: args.paletteItems,
    recordRecentCommand: args.runtime.recordRecentCommand,
    revealReviewAnswer: args.ws.revealReviewAnswer,
    setCommandPaletteOpen: args.runtime.setIsCommandPaletteOpen,
    setSettingsOpen: args.runtime.setIsSettingsOpen,
    startReviewSession: args.ws.startReviewSession,
    startStudyMode: args.study.startStudyMode,
    trashViewOpen: args.trash.isTrashViewOpen
  });

  return buildPaletteState(
    args.runtime.isCommandPaletteOpen,
    args.paletteItems,
    args.runtime.recentCommandIds,
    () => args.runtime.setIsCommandPaletteOpen(false),
    runPaletteCommand
  );
}

function useReviewPaletteItems(args: {
  hasReviewCard: boolean;
  hotkeys: ReturnType<typeof useCommandShortcutState>;
  isCurrentReviewItemGradable: boolean;
  isStudyMode: boolean;
  nav: ReturnType<typeof useWorkspaceControllerState>['nav'];
  reviewSession: ReturnType<typeof useWorkspaceSelectors>['reviewSession'];
  study: ReturnType<typeof useWorkspaceControllerState>['study'];
}) {
  return useMemo(
    () =>
      buildAppPaletteItems({
        canGoBack: args.nav.canGoBack,
        canGoForward: args.nav.canGoForward,
        canGoParent: args.nav.canGoParent,
        canRevealAnswer: args.hasReviewCard && args.isCurrentReviewItemGradable && !args.reviewSession.isAnswerRevealed,
        canToggleReviewMode: args.isStudyMode || args.study.canStartStudyMode,
        canGradeReview: args.hasReviewCard && args.isCurrentReviewItemGradable && args.reviewSession.isAnswerRevealed,
        canDeferReadingReview: args.hasReviewCard && !args.isCurrentReviewItemGradable,
        canCompleteReadingReview: args.hasReviewCard && !args.isCurrentReviewItemGradable,
        canDismissReadingReview: args.hasReviewCard && !args.isCurrentReviewItemGradable,
        isReviewMode: args.isStudyMode
      }).map((item) => ({
        ...item,
        shortcuts: isReviewShortcutCommand(item.id) ? args.hotkeys.shortcutMap[item.id] : item.shortcuts
      })),
    [args]
  );
}

function useReviewEditingState(args: {
  hotkeys: ReturnType<typeof useCommandShortcutState>;
  isCurrentReviewItemGradable: boolean;
  isStudyMode: boolean;
  runtime: ReturnType<typeof useWorkspaceControllerState>['runtime'];
  ws: ReturnType<typeof useWorkspaceSelectors>;
}) {
  return useReviewKeyboardShortcuts({
    isStudyMode: args.isStudyMode,
    isCommandPaletteOpen: args.runtime.isCommandPaletteOpen,
    isSettingsOpen: args.runtime.isSettingsOpen,
    reviewCurrentNodeId: args.ws.reviewSession.currentNodeId,
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

export function useAppController(): AppControllerResult {
  const ws = useWorkspaceSelectors();
  const appearance = useAppearanceState();
  const reviewSettings = useReviewSchedulerSettingsState();
  const nowIso = useNowIso();
  const isWorkspaceHydrated = useWorkspaceHydration();
  const controller = useWorkspaceControllerState(ws, isWorkspaceHydrated);
  const { exitStudyMode, isStudyMode, startStudyMode } = controller.study;
  const hotkeys = useCommandShortcutState(REVIEW_SHORTCUT_COMMAND_IDS);
  const reviewPreview = useCurrentReviewPreview(isStudyMode, ws, getReviewSchedulerSettingsSignature(reviewSettings.reviewSchedulerSettings));
  const currentReviewNode = ws.reviewSession.currentNodeId ? ws.nodesById[ws.reviewSession.currentNodeId] : undefined;
  const isCurrentReviewItemGradable = getReviewItemKind(currentReviewNode) === 'fsrs';
  const isReviewEditing = useReviewEditingState({ hotkeys, isCurrentReviewItemGradable, isStudyMode, runtime: controller.runtime, ws });
  const reviewDueCount = useMemo(() => countDueReviewNodes(ws.nodeOrder, ws.nodesById, ws.trashedNodeIds, nowIso, reviewSettings.reviewSchedulerSettings.pushQueue), [nowIso, reviewSettings.reviewSchedulerSettings.pushQueue, ws.nodeOrder, ws.nodesById, ws.trashedNodeIds]);
  const paletteItems = useReviewPaletteItems({ hasReviewCard: Boolean(ws.reviewSession.currentNodeId), hotkeys, isCurrentReviewItemGradable, isStudyMode, nav: controller.nav, reviewSession: ws.reviewSession, study: controller.study });
  const layoutProps = buildAppControllerLayoutProps({
    activeNode: controller.activeNode,
    appearance,
    blockedHotkeyUpdate: hotkeys.updateShortcut,
    canStartStudyMode: controller.study.canStartStudyMode,
    documentResize: controller.documentResize,
    editorCtx: controller.editorCtx,
    exitStudyMode,
    hotkeyItems: paletteItems,
    isReviewEditing,
    isStudyMode,
    listResize: controller.listResize,
    mapPaletteItemsToHotkeyItems: (items) => mapPaletteItemsToHotkeyItems(items, hotkeys.overrides),
    nav: controller.nav,
    nowIso,
    reviewDueCount,
    reviewPreview,
    reviewSettings,
    rightSidebarResize: controller.rightSidebarResize,
    runtime: controller.runtime,
    selectedTrashNode: controller.selectedTrashNode,
    startStudyMode,
    trash: controller.trash,
    ws
  });

  return {
    layoutProps: { ...layoutProps, onHotkeyReset: hotkeys.resetShortcut, onHotkeyResetAll: hotkeys.resetAllShortcuts },
    paletteState: buildControllerPaletteState({ isStudyMode, layoutProps, nav: controller.nav, paletteItems, runtime: controller.runtime, study: controller.study, trash: controller.trash, ws })
  };
}
