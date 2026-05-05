import { getReviewItemKind } from '../../features/review/model/reviewItemKind';
import { useAppearanceSettings } from '../../features/settings/context/AppearanceSettingsProvider';
import { useReviewSchedulerSettings } from '../../features/settings/context/ReviewSchedulerSettingsProvider';
import { getReviewSchedulerSettingsSignature } from '../../features/settings/model/reviewSchedulerSettings';
import { APP_COMMAND_IDS } from '../../shared/commands/ids';
import type { CommandPaletteItem } from '../../shared/commands/types';
import { restartMainWindowApp, toggleMainWindowDevTools } from '../../shared/platform/windowControls';
import type { WorkspaceLayoutProps } from '../components/WorkspaceLayout';

import { buildPaletteState, useCurrentReviewPreview } from './appControllerHelpers';
import { buildAppControllerLayoutProps } from './appControllerLayoutProps';
import { useNowIso, useWorkspaceControllerState, useWorkspaceSelectors } from './appControllerState';
import { buildControllerGoToNodeState } from './appGoToNodeState';
import type { AppGoToNodeState } from './appGoToNodeState';
import { buildHotkeySettings, type AppHotkeySettings } from './appHotkeySettings';
import { createPaletteCommandRunner } from './appPaletteCommandRunner';
import type { AppSearchState } from './appSearchState';
import { buildControllerSearchState } from './appSearchState';
import { countDueReviewNodes } from './layoutPropsBuilder';
import {
  REVIEW_SHORTCUT_COMMAND_IDS,
  useCommandShortcutState
} from './reviewHotkeysState';
import { useAppPaletteItems } from './useAppPaletteItems';
import { useFormalImport } from './useFormalImport';
import { useNativeCommandMenu } from './useNativeCommandMenu';
import { useReviewKeyboardShortcuts } from './useReviewKeyboardShortcuts';
import { useWorkspaceHydration } from './useWorkspaceHydration';

export interface AppPaletteState {
  isOpen: boolean;
  items: CommandPaletteItem[];
  recentCommandIds: string[];
  onClose: () => void;
  onRunCommand: (id: string) => void;
}

export interface AppControllerResult {
  hotkeySettings: AppHotkeySettings;
  goToNodeState: AppGoToNodeState;
  layoutProps: WorkspaceLayoutProps;
  paletteState: AppPaletteState;
  searchState: AppSearchState;
}

function useDerivedControllerState(args: {
  controller: ReturnType<typeof useWorkspaceControllerState>;
  exitStudyMode: () => void;
  formalImport: ReturnType<typeof useFormalImport>;
  hotkeys: ReturnType<typeof useCommandShortcutState>;
  isCurrentReviewItemGradable: boolean;
  isReviewEditing: boolean;
  isStudyMode: boolean;
  nowIso: string;
  reviewPreview: ReturnType<typeof useCurrentReviewPreview>;
  reviewSettings: ReturnType<typeof useReviewSchedulerSettings>;
  startStudyMode: () => void;
  ws: ReturnType<typeof useWorkspaceSelectors>;
}) {
  const reviewDueCount = countDueReviewNodes(args.ws.nodeOrder, args.ws.nodesById, args.ws.trashedNodeIds, args.nowIso, args.reviewSettings.reviewSchedulerSettings.pushQueue);
  const paletteItems = useAppPaletteItems({
    formalImportAvailable: args.formalImport.isAvailable && !args.formalImport.isImporting,
    hasReviewCard: Boolean(args.ws.reviewSession.currentNodeId),
    hotkeys: args.hotkeys,
    isCurrentReviewItemGradable: args.isCurrentReviewItemGradable,
    isStudyMode: args.isStudyMode,
    nav: args.controller.nav,
    reviewSession: args.ws.reviewSession,
    study: args.controller.study,
    ws: args.ws
  });
  const layoutProps = buildControllerLayoutState({
    controller: args.controller,
    exitStudyMode: args.exitStudyMode,
    formalImport: args.formalImport,
    isReviewEditing: args.isReviewEditing,
    isStudyMode: args.isStudyMode,
    nowIso: args.nowIso,
    reviewDueCount,
    reviewPreview: args.reviewPreview,
    reviewSettings: args.reviewSettings,
    startStudyMode: args.startStudyMode,
    ws: args.ws
  });
  return { layoutProps, paletteItems };
}

function buildControllerPaletteState(args: {
  appearance: ReturnType<typeof useAppearanceSettings>;
  formalImport: ReturnType<typeof useFormalImport>;
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
    goToNode: () => undefined,
    goParent: args.nav.handleGoParent,
    gradeReviewCard: args.ws.gradeReviewCard,
    importDirectory: args.formalImport.startImportDirectory,
    importSingleFile: args.formalImport.startImportFile,
    resetImportData: args.formalImport.resetImportData,
    isReviewMode: args.isStudyMode,
    openImportManagement: () => args.runtime.setIsImportManagementOpen(true),
    onToggleEditorDisplayMode: args.appearance.toggleEditorDisplayMode,
    onToggleListVisibility: args.layoutProps.onToggleListVisibility,
    onRestartApp: restartMainWindowApp,
    onToggleDevTools: toggleMainWindowDevTools,
    openTrashView: args.trash.openTrashView,
    paletteItems: args.paletteItems,
    recordRecentCommand: args.runtime.recordRecentCommand,
    revealReviewAnswer: args.ws.revealReviewAnswer,
    setCommandPaletteOpen: args.runtime.setIsCommandPaletteOpen,
    setGoToNodePaletteOpen: args.runtime.setIsGoToNodePaletteOpen,
    setSettingsOpen: args.runtime.setIsSettingsOpen,
    startClipboardImport: args.layoutProps.onStartClipboardImport,
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
    isSearchPaletteOpen: args.runtime.isSearchPaletteOpen,
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

function buildControllerLayoutState(args: {
  controller: ReturnType<typeof useWorkspaceControllerState>;
  exitStudyMode: () => void;
  formalImport: ReturnType<typeof useFormalImport>;
  isReviewEditing: boolean;
  isStudyMode: boolean;
  nowIso: string;
  reviewDueCount: number;
  reviewPreview: ReturnType<typeof useCurrentReviewPreview>;
  reviewSettings: ReturnType<typeof useReviewSchedulerSettings>;
  startStudyMode: () => void;
  ws: ReturnType<typeof useWorkspaceSelectors>;
}) {
  return buildAppControllerLayoutProps({
    activeNode: args.controller.activeNode,
    canStartStudyMode: args.controller.study.canStartStudyMode,
    documentResize: args.controller.documentResize,
    editorCtx: args.controller.editorCtx,
    exitStudyMode: args.exitStudyMode,
    isReviewEditing: args.isReviewEditing,
    isStudyMode: args.isStudyMode,
    listResize: args.controller.listResize,
    nav: args.controller.nav,
    nowIso: args.nowIso,
    reviewDueCount: args.reviewDueCount,
    reviewPreview: args.reviewPreview,
    reviewSettings: args.reviewSettings,
    rightSidebarResize: args.controller.rightSidebarResize,
    runtime: args.controller.runtime,
    runImportDirectory: args.formalImport.startImportDirectory,
    runImportFile: args.formalImport.startImportFile,
    selectedTrashNode: args.controller.selectedTrashNode,
    startStudyMode: args.startStudyMode,
    trash: args.controller.trash,
    ws: args.ws
  });
}

export function useAppController(): AppControllerResult {
  const ws = useWorkspaceSelectors();
  const appearance = useAppearanceSettings();
  const reviewSettings = useReviewSchedulerSettings();
  const nowIso = useNowIso();
  const isWorkspaceHydrated = useWorkspaceHydration();
  const controller = useWorkspaceControllerState(ws, isWorkspaceHydrated);
  const formalImport = useFormalImport();
  const { exitStudyMode, isStudyMode, startStudyMode } = controller.study;
  const hotkeys = useCommandShortcutState(REVIEW_SHORTCUT_COMMAND_IDS);
  const reviewPreview = useCurrentReviewPreview(isStudyMode, ws, getReviewSchedulerSettingsSignature(reviewSettings.reviewSchedulerSettings));
  const currentReviewNode = ws.reviewSession.currentNodeId ? ws.nodesById[ws.reviewSession.currentNodeId] : undefined;
  const isCurrentReviewItemGradable = getReviewItemKind(currentReviewNode) === 'fsrs';
  const isReviewEditing = useReviewEditingState({ hotkeys, isCurrentReviewItemGradable, isStudyMode, runtime: controller.runtime, ws });
  const { layoutProps, paletteItems } = useDerivedControllerState({
    controller,
    exitStudyMode,
    formalImport,
    hotkeys,
    isCurrentReviewItemGradable,
    isReviewEditing,
    isStudyMode,
    nowIso,
    reviewPreview,
    reviewSettings,
    startStudyMode,
    ws
  });
  const paletteState = buildControllerPaletteState({
    appearance,
    formalImport,
    isStudyMode,
    layoutProps,
    nav: controller.nav,
    paletteItems,
    runtime: controller.runtime,
    study: controller.study,
    trash: controller.trash,
    ws
  });
  const goToNodeState = buildControllerGoToNodeState({ runtime: controller.runtime, trash: controller.trash, ws });
  const searchState = buildControllerSearchState({ runtime: controller.runtime, trash: controller.trash, ws });

  useNativeCommandMenu(paletteState.items, paletteState.onRunCommand);

  return {
    hotkeySettings: buildHotkeySettings(paletteItems, hotkeys),
    goToNodeState,
    layoutProps,
    paletteState,
    searchState
  };
}
